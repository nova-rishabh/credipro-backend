/**
 * Credipro Contract Interaction Layer
 *
 * Provides high-level interface for interacting with the Credipro smart contract.
 * Handles circuit calls, proof generation, and state management.
 */

import { createHash } from 'crypto';
import { CircuitInputs, CircuitOutput, RequestLoanResponse, TriggerSlashingResponse, LoanRecord, Bytes32, toBytes32 } from './types';
import { initializeBorrowerContext, storeLoanDetails } from './prover';
import { MockOracleService } from './oracle';

/**
 * Credipro contract client
 * Wraps midnight-js SDK for clean API
 */
export class CrediproClient {
  private readonly PROOF_GENERATION_TIMEOUT = 30000;
  private oracleService?: MockOracleService;

  constructor(
    private contractAddress: Bytes32,
    private wallet: any,
    oracleService?: MockOracleService,
  ) {
    this.oracleService = oracleService;
    console.log(`[CONTRACT] CrediproClient initialized at ${this.contractAddress}`);
  }

  /**
   * Initialize borrower context before loan request
   *
   * FLOW:
   * 1. Borrower provides credit score and encrypted identity
   * 2. System stores in witness context
   * 3. Ready to call requestLoan() circuit
   */
  async initializeBorrower(
    creditScore: number,
    encryptedIdentity: any,
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
    console.log('[CONTRACT] Borrower context initialized');
  }

  /**
   * Request a loan (calls requestLoan circuit)
   *
   * CIRCUIT LOGIC:
   * 1. Retrieve witness: creditScore, identity, lender address
   * 2. Assert: creditScore >= minCreditScore (privately)
   * 3. Assert: loanAmount <= poolTVL (LTV check)
   * 4. Create identity commitment
   * 5. Record loan on ledger
   * 6. Return loanId
   *
   * ZERO-KNOWLEDGE:
   * - Proves creditworthiness WITHOUT revealing actual score
   * - Binds identity WITHOUT revealing real name/ID
   * - Generates zk-SNARK (BLS12-381 circuit)
   */
  async requestLoan(
    loanAmount: bigint,
    poolAddress: Bytes32,
    defaultTermDays: bigint
  ): Promise<RequestLoanResponse> {
    try {
      console.log('[CONTRACT] requestLoan() called');
      console.log(`  loanAmount: ${loanAmount}`);
      console.log(`  poolAddress: ${poolAddress}`);
      console.log(`  defaultTermDays: ${defaultTermDays}`);

      // Prepare circuit inputs
      const inputs: CircuitInputs = {
        loanAmount,
        poolAddress,
        defaultTermDays,
        borrowerPK: toBytes32('0x' + '1'.repeat(64)), // Placeholder
        mlaSigned: true
      };

      // Call requestLoan circuit (mock for MVP)
      const output = await this.callCircuit('requestLoan', inputs);

      if (!output.loanId) {
        return {
          success: false,
          error: 'Circuit failed to generate loan ID'
        };
      }

      // Store loan details for future reference
      storeLoanDetails({
        loanId: output.loanId,
        disbursalTimestamp: Math.floor(Date.now() / 1000),
        defaultThreshold: defaultTermDays
      });

      console.log(`[CONTRACT] Loan approved! ID: ${output.loanId}`);

      return {
        success: true,
        loanId: output.loanId,
        proof: output.proof,
        gasUsed: '150000' // Mock gas estimate
      };
    } catch (error) {
      console.error('[CONTRACT ERROR] requestLoan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Trigger slashing (calls triggerSlashing circuit)
   *
   * CIRCUIT LOGIC:
   * 1. Retrieve loan record
   * 2. Assert: not already defaulted
   * 3. Assert: default deadline exceeded (via witness)
   * 4. Assert: oracle consensus (>= 2 of 3)
   * 5. Mark loan as defaulted
   * 6. Trigger identity reveal (off-chain oracle action)
   *
   * ZERO-KNOWLEDGE:
   * - Circuit proves conditions are met
   * - Identity reveal happens off-chain (not exposed in circuit)
   * - Oracle committee handles actual decryption
   */
  async triggerSlashing(loanId: Bytes32): Promise<TriggerSlashingResponse> {
    try {
      console.log('[CONTRACT] triggerSlashing() called');
      console.log(`  loanId: ${loanId}`);

      // Check if enough oracle approvals exist
      const oracleApprovals = await this.getOracleApprovals(loanId);

      if (oracleApprovals < 2) {
        return {
          success: false,
          marked: false,
          error: 'Insufficient oracle approvals (need >= 2 of 3)'
        };
      }

      // Call triggerSlashing circuit
      await this.callCircuit('triggerSlashing', { loanId });

      console.log(`[CONTRACT] Slashing triggered for loan ${loanId}`);

      // Trigger off-chain oracle decryption
      await this.triggerOracleDecryption(loanId);

      return {
        success: true,
        marked: true,
        gasUsed: '120000' // Mock gas estimate
      };
    } catch (error) {
      console.error('[CONTRACT ERROR] triggerSlashing:', error);
      return {
        success: false,
        marked: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Verify Master Loan Agreement signature
   *
   * CIRCUIT LOGIC:
   * 1. Call verify_mla_signature witness
   * 2. Assert: signature is valid
   * 3. Return (no state change)
   */
  async verifyMasterLoanAgreement(
    borrowerPK: Bytes32,
    mlHash: Bytes32,
    signature: Uint8Array
  ): Promise<boolean> {
    try {
      console.log('[CONTRACT] verifyMasterLoanAgreement() called');

      // Call circuit (mock)
      const result = await this.callCircuit('verify_master_loan_agreement', {
        borrowerPK,
        mlHash,
        signature: Buffer.from(signature).toString('hex')
      });

      return result.success;
    } catch (error) {
      console.error('[CONTRACT ERROR] verifyMasterLoanAgreement:', error);
      return false;
    }
  }

  /**
   * Query loan details from ledger
   *
   * QUERIES (public data):
   * - Get loan record by ID
   * - Check if loan is defaulted
   * - Get lender address
   */
  async getLoanDetails(loanId: Bytes32): Promise<LoanRecord | null> {
    try {
      console.log('[CONTRACT] getLoanDetails() called');
      console.log(`  loanId: ${loanId}`);

      // Query encryptedIdentityCommitments ledger
      // For MVP: return mock data
      const mockLoan: LoanRecord = {
        loanId,
        identityHash: toBytes32('0x' + '2'.repeat(64)),
        lenderAddress: toBytes32('0x' + '3'.repeat(64)),
        borrowerPublicKey: toBytes32('0x' + '4'.repeat(64)),
        disbursedAmount: BigInt(100000),
        disbursalTimestamp: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
        defaultThreshold: BigInt(180), // 180 days
        isDefaulted: false,
        interestRate: 500 // 5%
      };

      console.log(`[CONTRACT] Retrieved loan ${loanId}`);
      return mockLoan;
    } catch (error) {
      console.error('[CONTRACT ERROR] getLoanDetails:', error);
      return null;
    }
  }

  /**
   * Query oracle approval count for a loan
   */
  async getOracleApprovals(loanId: Bytes32): Promise<number> {
    try {
      console.log('[CONTRACT] getOracleApprovals() called');
      console.log(`  loanId: ${loanId}`);

      if (this.oracleService) {
        return this.oracleService.getApprovalCount(loanId);
      }

      // Fallback: mock 2 of 3 approvals
      return 2;
    } catch (error) {
      console.error('[CONTRACT ERROR] getOracleApprovals:', error);
      return 0;
    }
  }

  /**
   * Get liquidity pool details
   */
  async getPoolDetails(poolAddress: Bytes32): Promise<{ tvl: bigint; riskParams: any } | null> {
    try {
      console.log('[CONTRACT] getPoolDetails() called');
      console.log(`  poolAddress: ${poolAddress}`);

      const mockParams = {
        tvl: BigInt(10000000), // 10M TVL
        riskParams: {
          minCreditScore: 680,
          maxLTV: 80,
          minMonthlyIncome: BigInt(5000)
        }
      };

      return mockParams;
    } catch (error) {
      console.error('[CONTRACT ERROR] getPoolDetails:', error);
      return null;
    }
  }

  /**
   * Private: Call circuit and generate proof
   */
  private async callCircuit(circuitName: string, inputs: any): Promise<CircuitOutput> {
    console.log(`[CIRCUIT] Calling ${circuitName} on ${this.contractAddress}...`);
    void this.wallet; // Reference for future wallet integration

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit call timeout after ${this.PROOF_GENERATION_TIMEOUT}ms`));
      }, this.PROOF_GENERATION_TIMEOUT);

      try {
        // Mock circuit execution
        // In production: use @midnight-ntwrk/compact-js to call actual circuits
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

  /**
   * Private: Generate mock proof (for MVP testing)
   *
   * In production: Use BLS12-381 elliptic curve to generate real zk-SNARK
   */
  private generateMockProof(circuitName: string, inputs: any): string {
    const inputStr = JSON.stringify(inputs, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    const hash = createHash('sha256').update(`${circuitName}:${inputStr}`).digest('hex');
    return '0x' + hash;
  }

  /**
   * Private: Trigger oracle committee to decrypt identity
   *
   * FLOW:
   * 1. Signal oracle committee that slashing conditions are met
   * 2. Oracle committee members vote (2 of 3 required)
   * 3. If consensus: perform off-chain decryption
   * 4. Send encrypted identity to affected lender
   * 5. Lender verifies MLA and pursues legal action
   */
  private async triggerOracleDecryption(loanId: Bytes32): Promise<void> {
    console.log('[ORACLE] Triggering decryption for loan', loanId);

    // In production:
    // 1. Emit on-chain event: LogSlashingTriggered(loanId)
    // 2. Oracle committee monitors events
    // 3. Off-chain: Perform threshold decryption
    // 4. Send identity to lender via secure channel

    // For MVP: Log placeholder
    console.log('[ORACLE] Would send decrypted identity to lender...');
  }
}

/**
 * Factory function to create and initialize client
 */
export async function createCrediproClient(
  contractAddress: Bytes32,
  wallet: any,
  oracleService?: MockOracleService
): Promise<CrediproClient> {
  const client = new CrediproClient(contractAddress, wallet, oracleService);
  console.log(`[SDK] Credipro client initialized at ${contractAddress}`);
  return client;
}
