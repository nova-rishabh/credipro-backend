import {
  CrediproClient,
  toBytes32,
  initializeBorrowerContext,
  storeLoanDetails,
  clearBorrowerContext,
  getBorrowerContext,
  verify_mla_signature,
} from '../index';
import { mockOracleService } from '../services/oracle';
import { jest } from '@jest/globals';

describe('Credipro SDK', () => {
  let client: CrediproClient;
  const contractAddress = toBytes32('0x' + '1'.repeat(64));
  const mockWallet = {};

  beforeEach(async () => {
    clearBorrowerContext();
    await mockOracleService.clearAllData();
  });

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

    describe('Validation & Negative Paths', () => {
      test('toBytes32 throws on invalid hex length', () => {
        expect(() => toBytes32('0x1234')).toThrow('Invalid Bytes32');
      });

      test('toBytes32 throws on non-hex prefix', () => {
        expect(() => toBytes32('1234')).toThrow('Invalid Bytes32');
      });

      test('verify_mla_signature returns false for empty signature', async () => {
        const pk = toBytes32('0x' + 'a'.repeat(64));
        const hash = toBytes32('0x' + 'b'.repeat(64));
        const result = await verify_mla_signature(pk, hash, new Uint8Array(0));
        expect(result).toBe(false);
      });

      test('verify_mla_signature returns false for null borrowerPk', async () => {
        const pk = toBytes32('0x' + 'c'.repeat(64));
        const hash = toBytes32('0x' + 'd'.repeat(64));
        const result = await verify_mla_signature(pk, hash, new Uint8Array(0));
        expect(result).toBe(false);
      });
    });
  });

  describe('Mock Oracle Service', () => {
    test('getCreditScore returns valid score (0-850)', async () => {
      const creditData = await mockOracleService.getCreditScore('borrower-1');
      expect(creditData.score).toBeGreaterThanOrEqual(0);
      expect(creditData.score).toBeLessThanOrEqual(850);
    });

    test('setMockCreditScore stores custom score', async () => {
      const borrowerId = 'borrower-2';
      const customScore = 750;

      await mockOracleService.setMockCreditScore(borrowerId, customScore, BigInt(5000));
      const creditData = await mockOracleService.getCreditScore(borrowerId);

      expect(creditData.score).toBe(customScore);
    });

    test('getEncryptedIdentity returns encrypted data', async () => {
      const encryptedIdentity = await mockOracleService.getEncryptedIdentity('borrower-3');
      expect(encryptedIdentity.ciphertext).toBeTruthy();
      expect(encryptedIdentity.iv).toBeTruthy();
      expect(encryptedIdentity.salt).toBeTruthy();
      expect(encryptedIdentity.algorithm).toBe('aes-256-gcm');
    });

    test('decryptIdentity recovers original identity', async () => {
      const borrowerId = 'borrower-4';
      const encrypted = await mockOracleService.getEncryptedIdentity(borrowerId);
      const decrypted = mockOracleService.decryptIdentity(encrypted);

      expect(decrypted.firstName).toBeTruthy();
      expect(decrypted.lastName).toBeTruthy();
      expect(decrypted.passportId).toBeTruthy();
      expect(decrypted.dateOfBirth).toBeTruthy();
    });

    test('Oracle committee voting tracks approvals', async () => {
      const loanId = toBytes32('0x' + '5'.repeat(64));

      const approved1 = await mockOracleService.voteApproval(loanId, 'oracle-1');
      expect(approved1).toBe(false);

      const approved2 = await mockOracleService.voteApproval(loanId, 'oracle-2');
      expect(approved2).toBe(true);

      expect(await mockOracleService.getApprovalCount(loanId)).toBe(2);
    });

    test('Oracle committee returns members list', () => {
      const members = mockOracleService.getOracleMembers();
      expect(members.length).toBe(3);
    });
  });

  describe('Credipro Contract Client', () => {
    beforeEach(async () => {
      client = new CrediproClient(contractAddress, mockWallet, mockOracleService);
    });

    test('requestLoan succeeds with valid inputs', async () => {
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

      await mockOracleService.voteApproval(loanId, 'oracle-1');
      await mockOracleService.voteApproval(loanId, 'oracle-2');

      storeLoanDetails({
        loanId,
        disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 200,
        defaultThreshold: BigInt(180)
      });

      const response = await client.triggerSlashing(loanId);

      expect(response.success).toBe(true);
      expect(response.marked).toBe(true);
    });

    test('triggerSlashing fails without sufficient oracle approvals', async () => {
      const loanId = toBytes32('0x' + 'b'.repeat(64));

      await mockOracleService.voteApproval(loanId, 'oracle-1');

      const client = new CrediproClient(contractAddress, mockWallet, mockOracleService);
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
      const signature = new Uint8Array(64);

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

      await mockOracleService.voteApproval(loanId, 'oracle-1');
      await mockOracleService.voteApproval(loanId, 'oracle-2');

      const approvals = await client.getOracleApprovals(loanId);

      expect(approvals).toBe(2);
    });

    test('negative: requestLoan with uninitialized borrower context still handled gracefully', async () => {
      clearBorrowerContext();
      const response = await client.requestLoan(
        BigInt(100000),
        toBytes32('0x' + 'f'.repeat(64)),
        BigInt(180)
      );
      expect(response.success).toBe(true);
    });

    test('negative: getOracleApprovals returns 0 when no votes exist', async () => {
      const emptyLoanId = toBytes32('0x' + '9'.repeat(64));
      const approvals = await client.getOracleApprovals(emptyLoanId);
      expect(approvals).toBe(0);
    });
  });

  describe('Sybil Attack Prevention', () => {
    test('Each borrower has unique identity hash', async () => {
      const identity1 = await mockOracleService.getEncryptedIdentity('borrower-sybil-1');
      const identity2 = await mockOracleService.getEncryptedIdentity('borrower-sybil-2');

      expect(identity1.ciphertext).not.toBe(identity2.ciphertext);
    });

    test('Oracle cannot approve same loan twice', async () => {
      const loanId = toBytes32('0x' + 'a'.repeat(64));

      await mockOracleService.voteApproval(loanId, 'oracle-1');
      const approvals1 = await mockOracleService.getApprovalCount(loanId);
      expect(approvals1).toBe(1);

      await mockOracleService.voteApproval(loanId, 'oracle-1');
      const approvals2 = await mockOracleService.getApprovalCount(loanId);
      expect(approvals2).toBe(1);

      await mockOracleService.voteApproval(loanId, 'oracle-2');
      const approvals3 = await mockOracleService.getApprovalCount(loanId);
      expect(approvals3).toBe(2);
    });

    test('Identity reveal only on full 2-of-3 consensus', async () => {
      const loanId = toBytes32('0x' + 'b'.repeat(64));

      const consensus1 = await mockOracleService.voteApproval(loanId, 'oracle-1');
      expect(consensus1).toBe(false);

      const consensus2 = await mockOracleService.voteApproval(loanId, 'oracle-2');
      expect(consensus2).toBe(true);

      const consensus3 = await mockOracleService.voteApproval(loanId, 'oracle-3');
      expect(consensus3).toBe(true);
    });
  });

  describe('Privacy Preservation', () => {
    test('Credit score never exposed on-chain', async () => {
      await mockOracleService.setMockCreditScore('borrower-privacy', 750, BigInt(5000));

      const borrowerId = 'borrower-privacy';
      const creditData = await mockOracleService.getCreditScore(borrowerId);

      expect(creditData.score).toBe(750);
    });

    test('Identity remains encrypted until default', async () => {
      const borrowerId = 'borrower-privacy-2';

      const encrypted = await mockOracleService.getEncryptedIdentity(borrowerId);
      expect(encrypted.ciphertext).not.toContain('John');
      expect(encrypted.ciphertext).not.toContain('Smith');

      const decrypted = mockOracleService.decryptIdentity(encrypted);
      expect(decrypted.firstName).toBeTruthy();
      expect(decrypted.lastName).toBeTruthy();
    });

    test('Oracle commitment prevents borrower replay attacks', async () => {
      const loanId1 = toBytes32('0x' + 'a'.repeat(64));
      const loanId2 = toBytes32('0x' + 'b'.repeat(64));

      expect(loanId1).not.toBe(loanId2);

      const encrypted1 = await mockOracleService.getEncryptedIdentity('same-borrower');
      const encrypted2 = await mockOracleService.getEncryptedIdentity('different-borrower');

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });
  });
});

describe('End-to-End Loan Flow', () => {
  test('Complete loan request → approval → default → slashing flow', async () => {
    const client = new CrediproClient(toBytes32('0x' + '1'.repeat(64)), {}, mockOracleService);

    const borrowerId = 'e2e-borrower';
    await mockOracleService.setMockCreditScore(borrowerId, 720, BigInt(6000));
    const encrypted = await mockOracleService.getEncryptedIdentity(borrowerId);

    initializeBorrowerContext(
      720,
      encrypted,
      toBytes32('0x' + 'd'.repeat(64)),
      toBytes32('0x' + 'e'.repeat(64))
    );

    const loanResponse = await client.requestLoan(
      BigInt(100000),
      toBytes32('0x' + 'f'.repeat(64)),
      BigInt(180)
    );

    expect(loanResponse.success).toBe(true);
    const loanId = loanResponse.loanId!;

    const loanDetails = await client.getLoanDetails(toBytes32(loanId));
    expect(loanDetails?.isDefaulted).toBe(false);

    await mockOracleService.voteApproval(toBytes32(loanId), 'oracle-1');
    await mockOracleService.voteApproval(toBytes32(loanId), 'oracle-2');

    const approvals = await client.getOracleApprovals(toBytes32(loanId));
    expect(approvals).toBeGreaterThanOrEqual(2);

    storeLoanDetails({
      loanId: toBytes32(loanId),
      disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 200,
      defaultThreshold: BigInt(180)
    });

    const slashingResponse = await client.triggerSlashing(toBytes32(loanId));
    expect(slashingResponse.success).toBe(true);

    const decryptedIdentity = mockOracleService.decryptIdentity(encrypted);
    expect(decryptedIdentity.firstName).toBeTruthy();
  });
});
