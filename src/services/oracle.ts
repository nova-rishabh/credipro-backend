import { CreditData, IdentityData, EncryptedIdentity, Bytes32 } from '../types';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto';
import { getDb } from '../lib/db';
import { logger } from '../lib/logger';
import { hashNoPad } from 'poseidon-goldilocks';

export class MockCreditBureau {
  async getCreditScore(borrowerId: string): Promise<CreditData> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM borrowers WHERE id = ?', borrowerId);
    
    if (row) {
      return {
        score: row.score,
        income: BigInt(3000), // Mocked static for now
        verificationDate: Math.floor(Date.now() / 1000),
        verificationSource: 'mock-db'
      };
    }

    const score = this.deterministic_credit_score(borrowerId);
    const income = this.deterministic_monthly_income(borrowerId);

    const creditData: CreditData = {
      score,
      income: BigInt(income),
      verificationDate: Math.floor(Date.now() / 1000),
      verificationSource: 'mock-db'
    };

    await db.run('INSERT INTO borrowers (id, score) VALUES (?, ?)', borrowerId, score);
    return creditData;
  }

  async setMockCreditScore(borrowerId: string, score: number, income: bigint): Promise<void> {
    if (score < 0 || score > 850) {
      throw new Error(`Invalid score: ${score}. Must be 0-850.`);
    }
    void income;

    const db = await getDb();
    await db.run('INSERT OR REPLACE INTO borrowers (id, score) VALUES (?, ?)', borrowerId, score);
    logger.info(`[MOCK-BUREAU] Set credit score for ${borrowerId}: ${score}`);
  }

  private deterministic_credit_score(borrowerId: string): number {
    const hash = hashNoPad([BigInt(Buffer.from(borrowerId).readUInt32BE(0))])[0];
    const hashNum = Number(hash % 250n);
    return 600 + hashNum;
  }

  private deterministic_monthly_income(borrowerId: string): number {
    const hash = hashNoPad([BigInt(Buffer.from(borrowerId + 'inc').readUInt32BE(0))])[0];
    const hashNum = Number(hash % 7000n);
    return 3000 + hashNum;
  }
}

export class MockIdentityProvider {
  private encryptionKey: string;

  constructor() {
    if (!process.env.CREDIPRO_ENCRYPTION_KEY) {
      throw new Error(
        'CREDIPRO_ENCRYPTION_KEY environment variable is required for MockIdentityProvider'
      );
    }
    this.encryptionKey = process.env.CREDIPRO_ENCRYPTION_KEY;
  }

  async registerIdentity(borrowerId: string, identity: IdentityData): Promise<void> {
    const db = await getDb();
    const encrypted = this.encryptIdentity(identity);
    
    await db.run(
      'INSERT OR REPLACE INTO identities (borrower_id, ciphertext, iv, salt, authTag, algorithm) VALUES (?, ?, ?, ?, ?, ?)',
      borrowerId, encrypted.ciphertext, encrypted.iv, encrypted.salt, encrypted.authTag, encrypted.algorithm
    );
    logger.info(`[MOCK-IDENTITY] Registered identity for ${borrowerId}`);
  }

  async getEncryptedIdentity(borrowerId: string): Promise<EncryptedIdentity> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM identities WHERE borrower_id = ?', borrowerId);

    if (row) {
      return {
        ciphertext: row.ciphertext,
        iv: row.iv,
        salt: row.salt,
        authTag: row.authTag,
        algorithm: row.algorithm
      };
    }

    const identity = this.generateMockIdentity(borrowerId);
    await this.registerIdentity(borrowerId, identity);
    return this.encryptIdentity(identity);
  }

  decryptIdentity(encryptedIdentity: EncryptedIdentity): IdentityData {
    try {
      const ciphertext = Buffer.from(encryptedIdentity.ciphertext, 'hex');
      const iv = Buffer.from(encryptedIdentity.iv, 'hex');
      const salt = Buffer.from(encryptedIdentity.salt, 'hex');
      const authTag = Buffer.from(encryptedIdentity.authTag, 'hex');

      const key = scryptSync(this.encryptionKey, salt, 32);

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const identity = JSON.parse(decrypted.toString('utf-8'));
      return identity as IdentityData;
    } catch (error) {
      logger.error('[MOCK-IDENTITY] Decryption failed:', error);
      throw new Error('Failed to decrypt identity');
    }
  }

  private generateMockIdentity(borrowerId: string): IdentityData {
    const hash = hashNoPad([BigInt(Buffer.from(borrowerId).readUInt32BE(0))])[0];
    const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];

    const firstIdx = Number(hash % BigInt(firstNames.length));
    const lastIdx = Number((hash / 10n) % BigInt(lastNames.length));

    return {
      firstName: firstNames[firstIdx],
      lastName: lastNames[lastIdx],
      passportId: `PAM${Math.random().toString(36).substring(7).toUpperCase()}`,
      dateOfBirth: `${1970 + Number(hash % 50n)}-01-01`,
      nationalId: `ID${Math.random().toString(36).substring(7).toUpperCase()}`,
      biometricHash: hash.toString(16).substring(0, 32)
    };
  }

  private encryptIdentity(identity: IdentityData): EncryptedIdentity {
    const identityJson = JSON.stringify(identity);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(this.encryptionKey, salt, 32);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(identityJson, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');

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

export interface OracleMember {
  id: string;
  name: string;
  publicKey: string;
}

export class OracleCommittee {
  private threshold: number;
  private members: OracleMember[];

  constructor(memberCount: number = 3, threshold: number = 2) {
    this.threshold = threshold;
    this.members = [];
    for (let i = 1; i <= memberCount; i++) {
      this.members.push({
        id: `oracle-${i}`,
        name: `Oracle Node ${i}`,
        publicKey: '0x' + i.toString().repeat(64)
      });
    }
    logger.info(`[ORACLE] Initialized committee with ${memberCount} members (threshold: ${threshold})`);
  }

  async voteApproval(loanId: Bytes32, oracleMemberId: string): Promise<boolean> {
    const member = this.members.find(m => m.id === oracleMemberId || m.name === oracleMemberId);
    if (!member) {
      throw new Error(`Unknown oracle member: ${oracleMemberId}`);
    }

    const memberId = member.id;
    const db = await getDb();

    // Check if member already voted
    const existing = await db.get('SELECT * FROM oracle_votes WHERE loan_id = ? AND oracle_member_id = ?', loanId, memberId);
    if (existing) {
      logger.warn(`[ORACLE] Member ${memberId} already voted for ${loanId}`);
    } else {
      await db.run('INSERT INTO oracle_votes (loan_id, oracle_member_id) VALUES (?, ?)', loanId, memberId);
    }

    const result = await db.get('SELECT COUNT(*) as count FROM oracle_votes WHERE loan_id = ?', loanId);
    const count = result.count;

    logger.info(`[ORACLE] ${memberId} voted YES for ${loanId}. Approvals: ${count}/${this.threshold}`);

    return count >= this.threshold;
  }

  async getApprovalCount(loanId: Bytes32): Promise<number> {
    const db = await getDb();
    const result = await db.get('SELECT COUNT(*) as count FROM oracle_votes WHERE loan_id = ?', loanId);
    return result ? result.count : 0;
  }

  async clearVotes(loanId?: Bytes32): Promise<void> {
    const db = await getDb();
    if (loanId) {
      await db.run('DELETE FROM oracle_votes WHERE loan_id = ?', loanId);
    } else {
      await db.run('DELETE FROM oracle_votes');
    }
  }

  async clearAllVotes(): Promise<void> {
    await this.clearVotes();
  }

  getMembers() {
    return this.members;
  }
}

export class MockOracleService {
  private creditBureau: MockCreditBureau;
  private identityProvider: MockIdentityProvider;
  private oracleCommittee: OracleCommittee;

  constructor() {
    this.creditBureau = new MockCreditBureau();
    this.identityProvider = new MockIdentityProvider();
    
    const count = process.env.ORACLE_MEMBER_COUNT ? parseInt(process.env.ORACLE_MEMBER_COUNT) : 3;
    const threshold = process.env.ORACLE_THRESHOLD ? parseInt(process.env.ORACLE_THRESHOLD) : 2;
    this.oracleCommittee = new OracleCommittee(count, threshold);
  }

  async getCreditScore(borrowerId: string): Promise<CreditData> {
    return this.creditBureau.getCreditScore(borrowerId);
  }

  async setMockCreditScore(borrowerId: string, score: number, income: bigint): Promise<void> {
    await this.creditBureau.setMockCreditScore(borrowerId, score, income);
  }

  async getEncryptedIdentity(borrowerId: string): Promise<EncryptedIdentity> {
    return this.identityProvider.getEncryptedIdentity(borrowerId);
  }

  decryptIdentity(encryptedIdentity: EncryptedIdentity): IdentityData {
    return this.identityProvider.decryptIdentity(encryptedIdentity);
  }

  async voteApproval(loanId: Bytes32, oracleMemberId: string): Promise<boolean> {
    return this.oracleCommittee.voteApproval(loanId, oracleMemberId);
  }

  async getApprovalCount(loanId: Bytes32): Promise<number> {
    return this.oracleCommittee.getApprovalCount(loanId);
  }

  getOracleMembers() {
    return this.oracleCommittee.getMembers();
  }

  async clearAllData(): Promise<void> {
    const db = await getDb();
    await db.run('DELETE FROM borrowers');
    await db.run('DELETE FROM identities');
    await db.run('DELETE FROM oracle_votes');
    logger.info('[MOCK-ORACLE] All data cleared');
  }
}

export const mockOracleService = new MockOracleService();
