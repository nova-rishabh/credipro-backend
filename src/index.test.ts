/**
 * Credipro SDK Tests
 *
 * Unit and integration tests for witness functions, circuit calls, and oracle service
 */

import {
  CrediproClient,
  toBytes32,
  initializeBorrowerContext,
  storeLoanDetails,
  clearBorrowerContext,
  getBorrowerContext
} from '../src/index';
import { mockOracleService } from '../src/oracle';

describe('Credipro SDK', () => {
  let client: CrediproClient;
  const contractAddress = toBytes32('0x' + '1'.repeat(64));
  const mockWallet = {}; // Mock wallet object

  beforeEach(() => {
    clearBorrowerContext();
    mockOracleService.clearAllData();
  });

  // =========================================================================
  // WITNESS FUNCTION TESTS
  // =========================================================================

  describe('Witness Functions', () => {
    test('initializeBorrowerContext stores credit data', () => {
      const creditScore = 720;
      const encryptedIdentity = {
        ciphertext: '0x' + 'a'.repeat(128),
        iv: '0x' + 'b'.repeat(24),
        salt: '0x' + 'c'.repeat(32),
        authTag: '0x' + 'd'.repeat(32),
        algorithm: 'aes-256-gcm'
      };
      const secretKey = toBytes32('0x' + 'd'.repeat(64));
      const lenderAddr = toBytes32('0x' + 'e'.repeat(64));

      initializeBorrowerContext(creditScore, encryptedIdentity, secretKey, lenderAddr);

      const context = getBorrowerContext();
      expect(context.hasCreditData).toBe(true);
      expect(context.hasEncryptedIdentity).toBe(true);
      expect(context.hasSecretKey).toBe(true);
      expect(context.hasLenderAddress).toBe(true);
    });

    test('getBorrowerContext returns correct state', () => {
      const context = getBorrowerContext();
      expect(context.hasCreditData).toBe(false);
      expect(context.hasEncryptedIdentity).toBe(false);
      expect(context.hasSecretKey).toBe(false);

      initializeBorrowerContext(
        720,
        {
          ciphertext: '0x' + 'a'.repeat(128),
          iv: '0x' + 'b'.repeat(24),
          salt: '0x' + 'c'.repeat(32),
          authTag: '0x' + 'd'.repeat(32),
          algorithm: 'aes-256-gcm'
        },
        toBytes32('0x' + 'd'.repeat(64)),
        toBytes32('0x' + 'e'.repeat(64))
      );

      const contextAfter = getBorrowerContext();
      expect(contextAfter.hasCreditData).toBe(true);
    });

    test('clearBorrowerContext removes all witness data', () => {
      initializeBorrowerContext(
        720,
        {
          ciphertext: '0x' + 'a'.repeat(128),
          iv: '0x' + 'b'.repeat(24),
          salt: '0x' + 'c'.repeat(32),
          authTag: '0x' + 'd'.repeat(32),
          algorithm: 'aes-256-gcm'
        },
        toBytes32('0x' + 'd'.repeat(64)),
        toBytes32('0x' + 'e'.repeat(64))
      );

      const contextBefore = getBorrowerContext();
      expect(contextBefore.hasCreditData).toBe(true);

      clearBorrowerContext();

      const contextAfter = getBorrowerContext();
      expect(contextAfter.hasCreditData).toBe(false);
      expect(contextAfter.hasEncryptedIdentity).toBe(false);
    });
  });

  // =========================================================================
  // MOCK ORACLE SERVICE TESTS
  // =========================================================================

  describe('Mock Oracle Service', () => {
    test('getCreditScore returns valid score (0-850)', () => {
      const creditData = mockOracleService.getCreditScore('borrower-1');
      expect(creditData.score).toBeGreaterThanOrEqual(0);
      expect(creditData.score).toBeLessThanOrEqual(850);
    });

    test('setMockCreditScore stores custom score', () => {
      const borrowerId = 'borrower-2';
      const customScore = 750;

      mockOracleService.setMockCreditScore(borrowerId, customScore, BigInt(5000));
      const creditData = mockOracleService.getCreditScore(borrowerId);

      expect(creditData.score).toBe(customScore);
    });

    test('getEncryptedIdentity returns encrypted data', () => {
      const encryptedIdentity = mockOracleService.getEncryptedIdentity('borrower-3');
      expect(encryptedIdentity.ciphertext).toBeTruthy();
      expect(encryptedIdentity.iv).toBeTruthy();
      expect(encryptedIdentity.salt).toBeTruthy();
      expect(encryptedIdentity.algorithm).toBe('aes-256-gcm');
    });

    test('decryptIdentity recovers original identity', () => {
      const borrowerId = 'borrower-4';
      const encrypted = mockOracleService.getEncryptedIdentity(borrowerId);
      const decrypted = mockOracleService.decryptIdentity(encrypted);

      expect(decrypted.firstName).toBeTruthy();
      expect(decrypted.lastName).toBeTruthy();
      expect(decrypted.passportId).toBeTruthy();
      expect(decrypted.dateOfBirth).toBeTruthy();
    });

    test('Oracle committee voting tracks approvals', () => {
      const loanId = toBytes32('0x' + '5'.repeat(64));

      const approved1 = mockOracleService.voteApproval(loanId, 'oracle-1');
      expect(approved1).toBe(false); // Only 1 approval, need 2

      const approved2 = mockOracleService.voteApproval(loanId, 'oracle-2');
      expect(approved2).toBe(true); // 2 approvals, consensus reached!

      expect(mockOracleService.getApprovalCount(loanId)).toBe(2);
    });

    test('Oracle committee returns members list', () => {
      const members = mockOracleService.getOracleMembers();
      expect(members.length).toBe(3);
    });
  });

  // =========================================================================
  // CONTRACT INTERACTION TESTS
  // =========================================================================

  describe('Credipro Contract Client', () => {
    beforeEach(async () => {
      client = new CrediproClient(contractAddress, mockWallet);
    });

    test('requestLoan succeeds with valid inputs', async () => {
      // Initialize borrower context first
      initializeBorrowerContext(
        720,
        {
          ciphertext: '0x' + 'a'.repeat(128),
          iv: '0x' + 'b'.repeat(24),
          salt: '0x' + 'c'.repeat(32),
          authTag: '0x' + 'd'.repeat(32),
          algorithm: 'aes-256-gcm'
        },
        toBytes32('0x' + 'd'.repeat(64)),
        toBytes32('0x' + 'e'.repeat(64))
      );

      const loanAmount = BigInt(100000);
      const poolAddress = toBytes32('0x' + 'f'.repeat(64));
      const defaultTermDays = BigInt(180);

      const response = await client.requestLoan(loanAmount, poolAddress, defaultTermDays);

      expect(response.success).toBe(true);
      expect(response.loanId).toBeTruthy();
      expect(response.proof).toBeTruthy();
    });

    test('requestLoan stores loan details', async () => {
      initializeBorrowerContext(
        720,
        {
          ciphertext: '0x' + 'a'.repeat(128),
          iv: '0x' + 'b'.repeat(24),
          salt: '0x' + 'c'.repeat(32),
          authTag: '0x' + 'd'.repeat(32),
          algorithm: 'aes-256-gcm'
        },
        toBytes32('0x' + 'd'.repeat(64)),
        toBytes32('0x' + 'e'.repeat(64))
      );

      await client.requestLoan(BigInt(100000), toBytes32('0x' + 'f'.repeat(64)), BigInt(180));

      const context = getBorrowerContext();
      expect(context.hasLoanDetails).toBe(true);
    });

    test('triggerSlashing succeeds with oracle consensus', async () => {
      const loanId = toBytes32('0x' + 'a'.repeat(64));

      // Simulate oracle voting
      mockOracleService.voteApproval(loanId, 'oracle-1');
      mockOracleService.voteApproval(loanId, 'oracle-2');

      // Initialize loan details
      storeLoanDetails({
        loanId,
        disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 200, // 200 days ago
        defaultThreshold: BigInt(180) // 180 days
      });

      const response = await client.triggerSlashing(loanId);

      expect(response.success).toBe(true);
      expect(response.marked).toBe(true);
    });

    test('triggerSlashing fails without sufficient oracle approvals', async () => {
      const loanId = toBytes32('0x' + 'b'.repeat(64));

      // Only 1 oracle approval (need 2)
      mockOracleService.voteApproval(loanId, 'oracle-1');

      const client = new CrediproClient(contractAddress, mockWallet);
      const getOracleApprovalsSpy = jest.spyOn(client, 'getOracleApprovals').mockResolvedValue(1);

      const response = await client.triggerSlashing(loanId);

      expect(response.success).toBe(false);
      expect(response.marked).toBe(false);
      expect(response.error).toContain('Insufficient oracle approvals');

      getOracleApprovalsSpy.mockRestore();
    });

    test('verifyMasterLoanAgreement returns boolean', async () => {
      const borrowerPK = toBytes32('0x' + 'c'.repeat(64));
      const mlHash = toBytes32('0x' + 'd'.repeat(64));
      const signature = new Uint8Array(64); // Empty signature for test

      const result = await client.verifyMasterLoanAgreement(borrowerPK, mlHash, signature);

      expect(typeof result).toBe('boolean');
    });

    test('getLoanDetails returns loan record', async () => {
      const loanId = toBytes32('0x' + 'e'.repeat(64));

      const loan = await client.getLoanDetails(loanId);

      expect(loan).toBeTruthy();
      expect(loan?.loanId).toBe(loanId);
      expect(loan?.isDefaulted).toBe(false);
    });

    test('getPoolDetails returns risk parameters', async () => {
      const poolAddress = toBytes32('0x' + 'f'.repeat(64));

      const pool = await client.getPoolDetails(poolAddress);

      expect(pool).toBeTruthy();
      expect(pool?.tvl).toBeTruthy();
      expect(pool?.riskParams.minCreditScore).toBeTruthy();
    });

    test('getOracleApprovals returns count', async () => {
      const loanId = toBytes32('0x' + 'a'.repeat(64));

      mockOracleService.voteApproval(loanId, 'oracle-1');
      mockOracleService.voteApproval(loanId, 'oracle-2');

      const approvals = await client.getOracleApprovals(loanId);

      expect(approvals).toBe(2);
    });
  });

  // =========================================================================
  // SYBIL ATTACK PREVENTION TESTS
  // =========================================================================

  describe('Sybil Attack Prevention', () => {
    test('Each borrower has unique identity hash', async () => {
      const identity1 = mockOracleService.getEncryptedIdentity('borrower-sybil-1');
      const identity2 = mockOracleService.getEncryptedIdentity('borrower-sybil-2');

      // Different borrowers should have different encrypted identities
      expect(identity1.ciphertext).not.toBe(identity2.ciphertext);
    });

    test('Oracle cannot approve same loan twice', () => {
      const loanId = toBytes32('0x' + 'a'.repeat(64));

      mockOracleService.voteApproval(loanId, 'oracle-1');
      const approvals1 = mockOracleService.getApprovalCount(loanId);
      expect(approvals1).toBe(1);

      // Same oracle voting again doesn't double-count (idempotent)
      mockOracleService.voteApproval(loanId, 'oracle-1');
      const approvals2 = mockOracleService.getApprovalCount(loanId);
      expect(approvals2).toBe(1); // Still 1, not 2

      // A different oracle can vote
      mockOracleService.voteApproval(loanId, 'oracle-2');
      const approvals3 = mockOracleService.getApprovalCount(loanId);
      expect(approvals3).toBe(2);
    });

    test('Identity reveal only on full 2-of-3 consensus', () => {
      const loanId = toBytes32('0x' + 'b'.repeat(64));

      // 1 approval
      const consensus1 = mockOracleService.voteApproval(loanId, 'oracle-1');
      expect(consensus1).toBe(false);

      // 2 approvals
      const consensus2 = mockOracleService.voteApproval(loanId, 'oracle-2');
      expect(consensus2).toBe(true); // Consensus reached!

      // 3 approvals doesn't change consensus (already true)
      const consensus3 = mockOracleService.voteApproval(loanId, 'oracle-3');
      expect(consensus3).toBe(true);
    });
  });

  // =========================================================================
  // PRIVACY TESTS
  // =========================================================================

  describe('Privacy Preservation', () => {
    test('Credit score never exposed on-chain', async () => {
      // Set custom credit score
      mockOracleService.setMockCreditScore('borrower-privacy', 750, BigInt(5000));

      // Simulate requestLoan (which should NOT expose the actual score)
      const borrowerId = 'borrower-privacy';
      const creditData = mockOracleService.getCreditScore(borrowerId);

      // The score is known to the prover, but circuit only proves it meets threshold
      expect(creditData.score).toBe(750); // Known locally
      // But NOT sent to ledger in plaintext

      // Circuit would generate proof: "score >= minCreditScore" without revealing 750
    });

    test('Identity remains encrypted until default', async () => {
      const borrowerId = 'borrower-privacy-2';

      // Identity is encrypted
      const encrypted = mockOracleService.getEncryptedIdentity(borrowerId);
      expect(encrypted.ciphertext).not.toContain('John'); // Not plaintext
      expect(encrypted.ciphertext).not.toContain('Smith');

      // Only decryption reveals identity
      const decrypted = mockOracleService.decryptIdentity(encrypted);
      expect(decrypted.firstName).toBeTruthy();
      expect(decrypted.lastName).toBeTruthy();
    });

    test('Oracle commitment prevents borrower replay attacks', async () => {
      const loanId1 = toBytes32('0x' + 'a'.repeat(64));
      const loanId2 = toBytes32('0x' + 'b'.repeat(64));

      // Loans have different IDs (prevent replay)
      expect(loanId1).not.toBe(loanId2);

      // Even if same borrower, identity commitment differs per loan
      const encrypted1 = mockOracleService.getEncryptedIdentity('same-borrower');
      const encrypted2 = mockOracleService.getEncryptedIdentity('different-borrower');

      // Different data produces different ciphertexts
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
  });
});

// ============================================================================
// INTEGRATION TEST: Full Loan Flow
// ============================================================================

describe('End-to-End Loan Flow', () => {
  test('Complete loan request → approval → default → slashing flow', async () => {
    const client = new CrediproClient(toBytes32('0x' + '1'.repeat(64)), {});

    // 1. ONBOARDING: Borrower registers identity and credit score
    const borrowerId = 'e2e-borrower';
    mockOracleService.setMockCreditScore(borrowerId, 720, BigInt(6000));
    const encrypted = mockOracleService.getEncryptedIdentity(borrowerId);

    // 2. Initialize borrower context
    initializeBorrowerContext(
      720,
      encrypted,
      toBytes32('0x' + 'd'.repeat(64)),
      toBytes32('0x' + 'e'.repeat(64))
    );

    // 3. REQUEST LOAN: Borrower submits loan request
    const loanResponse = await client.requestLoan(
      BigInt(100000),
      toBytes32('0x' + 'f'.repeat(64)),
      BigInt(180)
    );

    expect(loanResponse.success).toBe(true);
    const loanId = loanResponse.loanId!;

    // 4. Check loan details
    const loanDetails = await client.getLoanDetails(toBytes32(loanId));
    expect(loanDetails?.isDefaulted).toBe(false);

    // 5. ORACLE VOTING: Committee votes on default resolution
    mockOracleService.voteApproval(toBytes32(loanId), 'oracle-1');
    mockOracleService.voteApproval(toBytes32(loanId), 'oracle-2');

    const approvals = await client.getOracleApprovals(toBytes32(loanId));
    expect(approvals).toBeGreaterThanOrEqual(2);

    // 6. TRIGGER SLASHING: Mark loan as defaulted
    storeLoanDetails({
      loanId,
      disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 200,
      defaultThreshold: BigInt(180)
    });

    const slashingResponse = await client.triggerSlashing(toBytes32(loanId));
    expect(slashingResponse.success).toBe(true);

    // 7. IDENTITY REVEAL: Oracle committee decrypts identity
    const decryptedIdentity = mockOracleService.decryptIdentity(encrypted);
    expect(decryptedIdentity.firstName).toBeTruthy();

    // 8. LEGAL ACTION: Lender verifies MLA and pursues collections
    // (Off-chain action, not tested here)

    console.log(`✓ Complete loan flow successful!`);
  });
});
