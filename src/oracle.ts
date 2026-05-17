/**
 * Mock zkTLS Oracle Service
 *
 * Simulates a zero-knowledge TLS oracle that provides proof of off-chain credit data
 * without exposing the actual data.
 *
 * For hackathon MVP: Returns mock credit scores and identity data
 * In production: Integrates with real zkTLS services (zkPass, Reclaim Protocol, etc.)
 */

import { CreditData, IdentityData, EncryptedIdentity, Bytes32 } from './types';
import { randomBytes, scryptSync, createHash, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Mock Credit Bureau
 * Simulates returning credit scores for borrowers
 */
export class MockCreditBureau {
  private borrowers: Map<string, CreditData> = new Map();

  /**
   * Get credit score for a borrower
   * In production: Would call real FICO/credit bureau API via zkTLS
   */
  getCreditScore(borrowerId: string): CreditData {
    // Check if borrower exists in mock data
    if (this.borrowers.has(borrowerId)) {
      return this.borrowers.get(borrowerId)!;
    }

    // Generate deterministic mock data based on borrowerId
    const score = this.deterministic_credit_score(borrowerId);
    const income = this.deterministic_monthly_income(borrowerId);

    const creditData: CreditData = {
      score,
      income: BigInt(income),
      verificationDate: Math.floor(Date.now() / 1000),
      verificationSource: 'mock'
    };

    this.borrowers.set(borrowerId, creditData);
    return creditData;
  }

  /**
   * Set credit score for testing purposes
   */
  setMockCreditScore(borrowerId: string, score: number, income: bigint): void {
    if (score < 0 || score > 850) {
      throw new Error(`Invalid score: ${score}. Must be 0-850.`);
    }

    this.borrowers.set(borrowerId, {
      score,
      income,
      verificationDate: Math.floor(Date.now() / 1000),
      verificationSource: 'mock'
    });

    console.log(`[MOCK-BUREAU] Set credit score for ${borrowerId}: ${score}`);
  }

  /**
   * Deterministic credit score generation (for consistent testing)
   * Score varies based on borrowerId hash
   */
  private deterministic_credit_score(borrowerId: string): number {
    const hash = createHash('sha256').update(borrowerId).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    return 600 + (hashNum % 250);
  }

  /**
   * Deterministic monthly income generation
   */
  private deterministic_monthly_income(borrowerId: string): number {
    const hash = createHash('sha256').update(borrowerId + 'income').digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    return 3000 + (hashNum % 7000);
  }
}

/**
 * Mock Identity Provider
 * Simulates reading and encrypting identity data from NFC or secure storage
 */
export class MockIdentityProvider {
  private identities: Map<string, IdentityData> = new Map();
  private encryptionKey: string = process.env.CREDIPRO_ENCRYPTION_KEY || 'credipro-mvp-key-do-not-use';

  /**
   * Register a borrower's identity
   */
  registerIdentity(borrowerId: string, identity: IdentityData): void {
    this.identities.set(borrowerId, identity);
    console.log(`[MOCK-IDENTITY] Registered identity for ${borrowerId}`);
  }

  /**
   * Get encrypted identity for a borrower
   * In production: Would read from NFC chip or secure enclave
   */
  getEncryptedIdentity(borrowerId: string): EncryptedIdentity {
    let identity = this.identities.get(borrowerId);

    if (!identity) {
      // Generate deterministic mock identity if not registered
      identity = this.generateMockIdentity(borrowerId);
      this.identities.set(borrowerId, identity);
    }

    return this.encryptIdentity(identity);
  }

  /**
   * Decrypt identity (for oracle committee verification)
   * In production: Would use threshold decryption or MPC
   */
  decryptIdentity(encryptedIdentity: EncryptedIdentity): IdentityData {
    try {
      const ciphertext = Buffer.from(encryptedIdentity.ciphertext, 'hex');
      const iv = Buffer.from(encryptedIdentity.iv, 'hex');
      const salt = Buffer.from(encryptedIdentity.salt, 'hex');
      const authTag = Buffer.from(encryptedIdentity.authTag, 'hex');

      // Derive key from password and salt
      const key = scryptSync(this.encryptionKey, salt, 32);

      // Decrypt using AES-256-GCM
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const identity = JSON.parse(decrypted.toString('utf-8'));
      return identity as IdentityData;
    } catch (error) {
      console.error('[MOCK-IDENTITY] Decryption failed:', error);
      throw new Error('Failed to decrypt identity');
    }
  }

  /**
   * Generate deterministic mock identity
   */
  private generateMockIdentity(borrowerId: string): IdentityData {
    const hash = createHash('sha256').update(borrowerId).digest('hex');

    const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];

    const firstIdx = parseInt(hash.substring(0, 8), 16) % firstNames.length;
    const lastIdx = parseInt(hash.substring(8, 16), 16) % lastNames.length;

    return {
      firstName: firstNames[firstIdx],
      lastName: lastNames[lastIdx],
      passportId: `PAM${Math.random().toString(36).substring(7).toUpperCase()}`,
      dateOfBirth: `${1970 + (parseInt(hash.substring(16, 20), 16) % 50)}-01-01`,
      nationalId: `ID${Math.random().toString(36).substring(7).toUpperCase()}`,
      biometricHash: hash.substring(0, 32)
    };
  }

  /**
   * Encrypt identity using AES-256-GCM
   */
  private encryptIdentity(identity: IdentityData): EncryptedIdentity {
    const identityJson = JSON.stringify(identity);
    const salt = randomBytes(16);
    const iv = randomBytes(12); // 12 bytes for GCM
    const key = scryptSync(this.encryptionKey, salt, 32);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(identityJson, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');

    // Get auth tag for GCM
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag,
      algorithm: 'aes-256-gcm'
    };
  }
}

/**
 * Oracle Committee Manager
 * Manages 2-of-3 oracle voting for default resolutions
 */
export class OracleCommittee {
  private members: Map<string, any> = new Map();
  private votes: Map<string, Set<string>> = new Map(); // loanId -> Set of member IDs who voted

  /**
   * Initialize oracle committee with 3 members
   */
  constructor() {
    // Initialize 3 oracle members
    this.members.set('oracle-1', { name: 'Oracle Node 1', publicKey: '0x' + '1'.repeat(64) });
    this.members.set('oracle-2', { name: 'Oracle Node 2', publicKey: '0x' + '2'.repeat(64) });
    this.members.set('oracle-3', { name: 'Oracle Node 3', publicKey: '0x' + '3'.repeat(64) });
  }

  /**
   * Vote to approve a default resolution
   * Returns true if consensus (>= 2) reached
   */
  voteApproval(loanId: Bytes32, oracleMemberId: string): boolean {
    if (!this.members.has(oracleMemberId)) {
      throw new Error(`Unknown oracle member: ${oracleMemberId}`);
    }

    const loanIdStr = loanId;
    if (!this.votes.has(loanIdStr)) {
      this.votes.set(loanIdStr, new Set());
    }

    const loanVotes = this.votes.get(loanIdStr)!;
    if (loanVotes.has(oracleMemberId)) {
      console.warn(`[ORACLE] Member ${oracleMemberId} already voted for ${loanIdStr}`);
      // Ignore duplicate vote, but still return current consensus status
      return loanVotes.size >= 2;
    }
    loanVotes.add(oracleMemberId);

    console.log(
      `[ORACLE] ${oracleMemberId} voted YES for ${loanIdStr}. ` +
      `Approvals: ${loanVotes.size}/3`
    );

    // Return true if >= 2 approvals (consensus reached)
    return loanVotes.size >= 2;
  }

  /**
   * Get approval count for a loan
   */
  getApprovalCount(loanId: Bytes32): number {
    return this.votes.get(loanId) ? this.votes.get(loanId)!.size : 0;
  }

  /**
   * Clear votes for a loan (for testing)
   */
  clearVotes(loanId?: Bytes32): void {
    if (loanId) {
      this.votes.delete(loanId);
    } else {
      this.votes.clear();
    }
  }

  /**
   * Clear all oracle votes (for testing)
   */
  clearAllVotes(): void {
    this.votes.clear();
  }

  /**
   * Get all members (for voting UI)
   */
  getMembers() {
    return Array.from(this.members.values());
  }

  /**
   * Get votes for a loan
   */
  getVotes(loanId: Bytes32): string[] {
    return Array.from(this.votes.get(loanId) || []);
  }
}

/**
 * Unified Mock Oracle Service
 * Combines credit bureau, identity provider, and oracle committee
 */
export class MockOracleService {
  private creditBureau: MockCreditBureau;
  private identityProvider: MockIdentityProvider;
  private oracleCommittee: OracleCommittee;

  constructor() {
    this.creditBureau = new MockCreditBureau();
    this.identityProvider = new MockIdentityProvider();
    this.oracleCommittee = new OracleCommittee();
  }

  // Credit Bureau Interface
  getCreditScore(borrowerId: string): CreditData {
    return this.creditBureau.getCreditScore(borrowerId);
  }

  setMockCreditScore(borrowerId: string, score: number, income: bigint): void {
    this.creditBureau.setMockCreditScore(borrowerId, score, income);
  }

  // Identity Provider Interface
  getEncryptedIdentity(borrowerId: string): EncryptedIdentity {
    return this.identityProvider.getEncryptedIdentity(borrowerId);
  }

  decryptIdentity(encryptedIdentity: EncryptedIdentity): IdentityData {
    return this.identityProvider.decryptIdentity(encryptedIdentity);
  }

  // Oracle Committee Interface
  voteApproval(loanId: Bytes32, oracleMemberId: string): boolean {
    return this.oracleCommittee.voteApproval(loanId, oracleMemberId);
  }

  /**
   * Get approval count for a loan
   */
  getApprovalCount(loanId: Bytes32): number {
    return this.oracleCommittee.getApprovalCount(loanId);
  }

  /**
   * Get all oracle members
   */
  getOracleMembers() {
    return this.oracleCommittee.getMembers();
  }

  /**
   * Clear all data (for testing)
   */
  clearAllData(): void {
    this.creditBureau = new MockCreditBureau();
    this.identityProvider = new MockIdentityProvider();
    this.oracleCommittee = new OracleCommittee();
    console.log('[MOCK-ORACLE] All data cleared');
  }
}

// Export singleton instance
export const mockOracleService = new MockOracleService();
