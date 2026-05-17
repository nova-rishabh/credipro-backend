import { CircuitInputs, CircuitOutput, RequestLoanResponse, TriggerSlashingResponse, LoanRecord, EncryptedIdentity, PublicRiskParam, Bytes32, toBytes32 } from '../types';
import { initializeBorrowerContext, storeLoanDetails } from './prover';
import { MockOracleService } from './oracle';
import { logger } from '../lib/logger';
import { hashNoPad } from 'poseidon-goldilocks';

type CircuitCallInputs = CircuitInputs | { loanId: Bytes32 } | Record<string, unknown>;

export class CrediproClient {
  private readonly PROOF_GENERATION_TIMEOUT = 30000;
  private oracleService?: MockOracleService;

  constructor(
    private contractAddress: Bytes32,
    private wallet: Record<string, unknown>,
    oracleService?: MockOracleService,
  ) {
    this.oracleService = oracleService;
    logger.info(`[CONTRACT] CrediproClient initialized at ${this.contractAddress}`);
  }

  async initializeBorrower(
    creditScore: number,
    encryptedIdentity: EncryptedIdentity,
    secretKey: Bytes32,
    lenderAddress: Bytes32
  ): Promise<void> {
    if (creditScore < 0 || creditScore > 850) {
      throw new Error(`Invalid credit score: ${creditScore}`);
    }

    if (!encryptedIdentity.ciphertext || !encryptedIdentity.iv) {
      throw new Error('Invalid encrypted identity format');
    }

    initializeBorrowerContext(creditScore, encryptedIdentity, secretKey, lenderAddress);
    logger.info('[CONTRACT] Borrower context initialized');
  }

  async requestLoan(
    loanAmount: bigint,
    poolAddress: Bytes32,
    defaultTermDays: bigint
  ): Promise<RequestLoanResponse> {
    try {
      logger.info('[CONTRACT] requestLoan() called');
      logger.info(`  loanAmount: ${loanAmount}`);
      logger.info(`  poolAddress: ${poolAddress}`);
      logger.info(`  defaultTermDays: ${defaultTermDays}`);

      const inputs: CircuitInputs = {
        loanAmount,
        poolAddress,
        defaultTermDays,
        borrowerPK: toBytes32('0x' + '1'.repeat(64)),
        mlaSigned: true
      };

      const output = await this.callCircuit('requestLoan', inputs);

      if (!output.loanId) {
        return {
          success: false,
          error: 'Circuit failed to generate loan ID'
        };
      }

      storeLoanDetails({
        loanId: output.loanId,
        disbursalTimestamp: Math.floor(Date.now() / 1000),
        defaultThreshold: defaultTermDays
      });

      logger.info(`[CONTRACT] Loan approved! ID: ${output.loanId}`);

      return {
        success: true,
        loanId: output.loanId,
        proof: output.proof,
        gasUsed: '150000'
      };
    } catch (error) {
      logger.error('[CONTRACT ERROR] requestLoan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async triggerSlashing(loanId: Bytes32): Promise<TriggerSlashingResponse> {
    try {
      logger.info('[CONTRACT] triggerSlashing() called');
      logger.info(`  loanId: ${loanId}`);

      const oracleApprovals = await this.getOracleApprovals(loanId);

      if (oracleApprovals < 2) {
        return {
          success: false,
          marked: false,
          error: 'Insufficient oracle approvals (need >= 2 of 3)'
        };
      }

      await this.callCircuit('triggerSlashing', { loanId });

      logger.info(`[CONTRACT] Slashing triggered for loan ${loanId}`);

      await this.triggerOracleDecryption(loanId);

      return {
        success: true,
        marked: true,
        gasUsed: '120000'
      };
    } catch (error) {
      logger.error('[CONTRACT ERROR] triggerSlashing:', error);
      return {
        success: false,
        marked: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async verifyMasterLoanAgreement(
    borrowerPK: Bytes32,
    mlHash: Bytes32,
    signature: Uint8Array
  ): Promise<boolean> {
    try {
      logger.info('[CONTRACT] verifyMasterLoanAgreement() called');

      const result = await this.callCircuit('verify_master_loan_agreement', {
        borrowerPK,
        mlHash,
        signature: Buffer.from(signature).toString('hex')
      });

      return result.success;
    } catch (error) {
      logger.error('[CONTRACT ERROR] verifyMasterLoanAgreement:', error);
      return false;
    }
  }

  async getLoanDetails(loanId: Bytes32): Promise<LoanRecord | null> {
    try {
      logger.info('[CONTRACT] getLoanDetails() called');
      logger.info(`  loanId: ${loanId}`);

      const mockLoan: LoanRecord = {
        loanId,
        identityHash: toBytes32('0x' + '2'.repeat(64)),
        lenderAddress: toBytes32('0x' + '3'.repeat(64)),
        borrowerPublicKey: toBytes32('0x' + '4'.repeat(64)),
        disbursedAmount: BigInt(100000),
        disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 30,
        defaultThreshold: BigInt(180),
        isDefaulted: false,
        interestRate: 500
      };

      logger.info(`[CONTRACT] Retrieved loan ${loanId}`);
      return mockLoan;
    } catch (error) {
      logger.error('[CONTRACT ERROR] getLoanDetails:', error);
      return null;
    }
  }

  async getOracleApprovals(loanId: Bytes32): Promise<number> {
    try {
      logger.info('[CONTRACT] getOracleApprovals() called');
      logger.info(`  loanId: ${loanId}`);

      if (this.oracleService) {
        return await this.oracleService.getApprovalCount(loanId);
      }

      return 2;
    } catch (error) {
      logger.error('[CONTRACT ERROR] getOracleApprovals:', error);
      return 0;
    }
  }

  async getPoolDetails(poolAddress: Bytes32): Promise<{ tvl: bigint; riskParams: PublicRiskParam } | null> {
    try {
      logger.info('[CONTRACT] getPoolDetails() called');
      logger.info(`  poolAddress: ${poolAddress}`);

      const mockParams: { tvl: bigint; riskParams: PublicRiskParam } = {
        tvl: BigInt(10000000),
        riskParams: {
          minCreditScore: 680,
          maxLTV: 80,
          minMonthlyIncome: BigInt(5000),
          maxLoanAmount: BigInt(500000),
        }
      };

      return mockParams;
    } catch (error) {
      logger.error('[CONTRACT ERROR] getPoolDetails:', error);
      return null;
    }
  }

  private async callCircuit(circuitName: string, inputs: CircuitCallInputs): Promise<CircuitOutput> {
    logger.info(`[CIRCUIT] Calling ${circuitName} on ${this.contractAddress}...`);
    void this.wallet;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit call timeout after ${this.PROOF_GENERATION_TIMEOUT}ms`));
      }, this.PROOF_GENERATION_TIMEOUT);

      try {
        const mockProof = this.generateMockProof(circuitName, inputs);
        const mockLoanId = toBytes32('0x' + '5'.repeat(64));

        clearTimeout(timeout);

        resolve({
          success: true,
          loanId: mockLoanId,
          proof: mockProof,
          publicInputs: [mockLoanId]
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private generateMockProof(circuitName: string, inputs: CircuitCallInputs): string {
    const inputStr = JSON.stringify(inputs, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    
    // Use Poseidon hash for mock ZK proof generation
    const data = Buffer.from(`${circuitName}:${inputStr}`);
    const hashValues = [];
    for (let i = 0; i < data.length; i += 32) {
      const chunk = data.subarray(i, i + 32);
      const padded = Buffer.alloc(32);
      chunk.copy(padded);
      hashValues.push(BigInt('0x' + padded.toString('hex')));
    }
    if (hashValues.length === 0) hashValues.push(0n);
    const result = hashNoPad([hashValues[0]])[0];
    return '0x' + result.toString(16).padStart(64, '0');
  }

  private async triggerOracleDecryption(loanId: Bytes32): Promise<void> {
    logger.info('[ORACLE] Triggering decryption for loan', loanId);
    logger.info('[ORACLE] Would send decrypted identity to lender...');
  }
}

export async function createCrediproClient(
  contractAddress: Bytes32,
  wallet: Record<string, unknown>,
  oracleService?: MockOracleService
): Promise<CrediproClient> {
  const client = new CrediproClient(contractAddress, wallet, oracleService);
  logger.info(`[SDK] Credipro client initialized at ${contractAddress}`);
  return client;
}
