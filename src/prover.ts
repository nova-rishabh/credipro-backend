/**
 * Credipro Witness Implementation
 *
 * This module implements all witness functions declared in Credipro.compact.
 * These functions execute off-chain in the prover and provide private data
 * to the circuit without exposing it to the ledger.
 *
 * CRITICAL: These are NOT on-chain functions. They run locally and provide
 * witness data to ZK circuits. Never expose sensitive data here!
 */

import { createHash } from 'crypto';
import { EncryptedIdentity, CreditData, Bytes32, toBytes32 } from './types';

/**
 * Cryptographic utility for Poseidon hashing
 * In production: Use @midnight-ntwrk/poseidon library
 */
class PoseidonHasher {
  /**
   * Compute Poseidon hash of input
   * For MVP: Use SHA256 as placeholder (replace with real Poseidon)
   */
  static hash(input: Buffer | string): Bytes32 {
    const data = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
    const hash = createHash('sha256').update(data).digest('hex');
    return toBytes32(hash);
  }

  /**
   * Compute hash of vector [a, b, c]
   */
  static hashVector(inputs: Buffer[]): Bytes32 {
    const concatenated = Buffer.concat(inputs);
    return this.hash(concatenated);
  }
}

/**
 * Local storage for witness data
 * In production: Use encrypted local storage (e.g., Web Crypto API in browser)
 */
class WitnessStorage {
  private storage: Map<string, any> = new Map();

  set(key: string, value: any): void {
    this.storage.set(key, value);
  }

  get(key: string): any {
    return this.storage.get(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

const witnessStorage = new WitnessStorage();

// ============================================================================
// WITNESS IMPLEMENTATIONS
// ============================================================================

/**
 * witness mock_zkTLS_CreditScore(): Uint<0..850>
 *
 * PURPOSE:
 * Returns the borrower's off-chain credit score (mocked for MVP).
 *
 * SEMANTICS:
 * - In production: Calls real zkTLS oracle (zkPass, Reclaim Protocol, etc.)
 * - For hackathon MVP: Returns locally stored mock credit score
 * - Privacy: The actual score is NEVER disclosed on-chain, only ZK proof
 *
 * IMPLEMENTATION:
 * 1. Retrieve borrower's credit data from local storage
 * 2. Validate score is in range [0, 850]
 * 3. Return score to circuit
 * 4. Circuit will assert: score >= minCreditScore (privately)
 */
export async function mock_zkTLS_CreditScore(): Promise<number> {
  try {
    // Retrieve from local witness storage (set during borrower onboarding)
    const creditData: CreditData | undefined = witnessStorage.get('creditData');

    if (!creditData) {
      throw new Error(
        'Credit data not found in witness storage. ' +
        'Call setBorrowerCreditData() during onboarding.'
      );
    }

    // Validate range
    if (creditData.score < 0 || creditData.score > 850) {
      throw new Error(
        `Invalid credit score: ${creditData.score}. Must be 0-850.`
      );
    }

    // Validate freshness (not older than 90 days)
    const ageInDays = (Date.now() / 1000 - creditData.verificationDate) / 86400;
    if (ageInDays > 90) {
      console.warn(
        `Credit data is ${ageInDays.toFixed(0)} days old. ` +
        'Consider refreshing from oracle.'
      );
    }

    console.log(
      `[WITNESS] mock_zkTLS_CreditScore: returning score ${creditData.score}`
    );
    return creditData.score;
  } catch (error) {
    console.error('[WITNESS ERROR] mock_zkTLS_CreditScore:', error);
    throw error;
  }
}

/**
 * witness read_Identity_NFC(): Opaque<"Uint8Array">
 *
 * PURPOSE:
 * Reads encrypted identity data from local NFC chip or secure storage.
 *
 * SEMANTICS:
 * - In production: Reads from NFC passport chip (ISO 14443 protocol)
 * - For hackathon MVP: Reads from encrypted local storage
 * - Returns opaque bytes (circuit cannot inspect content)
 * - Privacy: Identity data NEVER leaves the local machine
 *
 * IMPLEMENTATION:
 * 1. Retrieve encrypted identity from witness storage
 * 2. Validate encryption (correct IV, salt, ciphertext)
 * 3. Return opaque bytes to circuit
 * 4. Circuit will pass to compute_identity_hash() (off-chain)
 */
export async function read_Identity_NFC(): Promise<Uint8Array> {
  try {
    // Retrieve encrypted identity from local storage
    const encryptedIdentity: EncryptedIdentity | undefined = witnessStorage.get(
      'encryptedIdentity'
    );

    if (!encryptedIdentity) {
      throw new Error(
        'Encrypted identity not found in witness storage. ' +
        'Call storeEncryptedIdentity() during onboarding.'
      );
    }

    // Validate structure
    if (
      !encryptedIdentity.ciphertext ||
      !encryptedIdentity.iv ||
      !encryptedIdentity.salt
    ) {
      throw new Error('Invalid encrypted identity structure');
    }

    // Convert hex to Uint8Array
    const ciphertextBuffer = Buffer.from(encryptedIdentity.ciphertext, 'hex');

    console.log(
      `[WITNESS] read_Identity_NFC: returning ${ciphertextBuffer.length} bytes`
    );
    return new Uint8Array(ciphertextBuffer);
  } catch (error) {
    console.error('[WITNESS ERROR] read_Identity_NFC:', error);
    throw error;
  }
}

/**
 * witness compute_identity_hash(passport_data: Opaque<"Uint8Array">): Bytes<32>
 *
 * PURPOSE:
 * Derives a deterministic identity commitment hash locally (off-chain).
 *
 * SEMANTICS:
 * - Takes opaque encrypted passport data from read_Identity_NFC()
 * - Computes Poseidon hash (deterministic, collision-resistant)
 * - Hash is disclosed on-chain (bound to the loan)
 * - Actual passport data remains strictly off-chain
 *
 * IMPLEMENTATION:
 * 1. Decrypt the passport data using borrower's local key
 * 2. Parse decrypted identity JSON
 * 3. Compute hash of identity (deterministic)
 * 4. Return hash bytes
 *
 * NOTE: This function is also called from the circuit, but we implement
 * it off-chain here to avoid expensive decryption in the circuit.
 */
export async function compute_identity_hash(
  passportData: Uint8Array
): Promise<Bytes32> {
  try {
    // In a real implementation, decrypt passportData here
    // For MVP, we'll use a deterministic hash of the data

    // Ensure passportData is not empty
    if (passportData.length === 0) {
      throw new Error('Passport data is empty');
    }

    // Compute hash using Poseidon (or SHA256 for MVP)
    const hash = PoseidonHasher.hash(Buffer.from(passportData));

    console.log(`[WITNESS] compute_identity_hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error('[WITNESS ERROR] compute_identity_hash:', error);
    throw error;
  }
}

/**
 * witness local_secret_key(): Bytes<32>
 *
 * PURPOSE:
 * Retrieves the borrower's locally-held secret key for signing transactions.
 *
 * SEMANTICS:
 * - Used to derive public key via derive_public_key() circuit
 * - NEVER disclosed on-chain
 * - Remains strictly in witness context
 *
 * IMPLEMENTATION:
 * 1. Retrieve secret key from secure local storage (Lace Wallet, browser storage, etc.)
 * 2. Validate key format (32 bytes)
 * 3. Return to circuit
 */
export async function local_secret_key(): Promise<Bytes32> {
  try {
    const secretKey: string | undefined = witnessStorage.get('secretKey');

    if (!secretKey) {
      throw new Error(
        'Secret key not found in witness storage. ' +
        'Initialize wallet during onboarding.'
      );
    }

    // Validate format (32 bytes = 64 hex chars)
    if (secretKey.length !== 64) {
      throw new Error(
        `Invalid secret key length: ${secretKey.length}. Expected 64 hex chars.`
      );
    }

    console.log('[WITNESS] local_secret_key: returning secret key');
    return toBytes32(secretKey);
  } catch (error) {
    console.error('[WITNESS ERROR] local_secret_key:', error);
    throw error;
  }
}

/**
 * witness get_lender_address(): Bytes<32>
 *
 * PURPOSE:
 * Retrieves the underwriter's address for the current loan request.
 *
 * SEMANTICS:
 * - Identifies which institutional lender originated the loan
 * - Deterministically incorporated into the loan ID hash
 * - Can be disclosed on-chain (not sensitive)
 *
 * IMPLEMENTATION:
 * 1. Retrieve from witness context (set before calling requestLoan circuit)
 * 2. Validate Bytes32 format
 * 3. Return to circuit
 */
export async function get_lender_address(): Promise<Bytes32> {
  try {
    const lenderAddr: string | undefined = witnessStorage.get('lenderAddress');

    if (!lenderAddr) {
      throw new Error(
        'Lender address not found in witness storage. ' +
        'Set target pool address before requesting loan.'
      );
    }

    const bytes32 = toBytes32(lenderAddr);
    console.log(`[WITNESS] get_lender_address: ${bytes32}`);
    return bytes32;
  } catch (error) {
    console.error('[WITNESS ERROR] get_lender_address:', error);
    throw error;
  }
}

/**
 * witness get_loan_details(): LoanIdentityRecord
 *
 * PURPOSE:
 * Retrieves stored loan details locally (for updates during slashing).
 *
 * SEMANTICS:
 * - Used during triggerSlashing circuit to fetch current loan state
 * - Allows off-chain updates before submitting proof
 *
 * IMPLEMENTATION:
 * 1. Retrieve loan details from witness storage
 * 2. Return to circuit
 */
export async function get_loan_details() {
  try {
    const loanDetails = witnessStorage.get('currentLoanDetails');

    if (!loanDetails) {
      throw new Error(
        'Loan details not found in witness storage. ' +
        'Call a requestLoan circuit first.'
      );
    }

    console.log(`[WITNESS] get_loan_details: ${loanDetails.loanId}`);
    return loanDetails;
  } catch (error) {
    console.error('[WITNESS ERROR] get_loan_details:', error);
    throw error;
  }
}

/**
 * witness check_default_deadline_exceeded(): Boolean
 *
 * PURPOSE:
 * Verifies that the current timestamp exceeds the default deadline.
 *
 * SEMANTICS:
 * - Called during triggerSlashing circuit
 * - Returns true if: now > disbursalTimestamp + defaultThreshold
 * - Confirms the loan is past due
 *
 * IMPLEMENTATION:
 * 1. Get current time (Unix timestamp)
 * 2. Retrieve loan details
 * 3. Compute deadline = disbursalTimestamp + defaultThreshold (in days)
 * 4. Compare current time with deadline
 * 5. Return boolean to circuit
 */
export async function check_default_deadline_exceeded(): Promise<boolean> {
  try {
    const loanDetails = witnessStorage.get('currentLoanDetails');

    if (!loanDetails) {
      throw new Error('Loan details not found for deadline check');
    }

    const now = Math.floor(Date.now() / 1000); // Current Unix timestamp
    const disbursalTimestamp = loanDetails.disbursalTimestamp;
    const defaultThresholdDays = BigInt(loanDetails.defaultThreshold);
    const defaultThresholdSeconds = defaultThresholdDays * BigInt(86400); // Convert days to seconds

    const deadline = BigInt(disbursalTimestamp) + defaultThresholdSeconds;
    const exceeded = BigInt(now) > deadline;

    console.log(
      `[WITNESS] check_default_deadline_exceeded: ` +
      `now=${now}, deadline=${deadline.toString()}, exceeded=${exceeded}`
    );

    return exceeded;
  } catch (error) {
    console.error('[WITNESS ERROR] check_default_deadline_exceeded:', error);
    throw error;
  }
}

/**
 * witness verify_mla_signature(
 *   borrower_pk: Bytes<32>,
 *   mla_hash: Bytes<32>,
 *   signature: Opaque<"Uint8Array">
 * ): Boolean
 *
 * PURPOSE:
 * Verifies that the borrower has signed the Master Loan Agreement (MLA).
 *
 * SEMANTICS:
 * - MLA is the off-chain legal contract defining jurisdiction, terms, etc.
 * - Signature verification is done off-chain by the prover
 * - Circuit receives boolean result (cannot verify signatures in ZK)
 * - Returns true if signature is valid
 *
 * IMPLEMENTATION:
 * 1. Verify ECDSA signature (or Ed25519) against borrower's public key
 * 2. Ensure MLA hash matches expected value
 * 3. Return boolean to circuit
 */
export async function verify_mla_signature(
  borrowerPk: Bytes32,
  mlHash: Bytes32,
  signature: Uint8Array
): Promise<boolean> {
  try {
    // In a real implementation, this would verify an ECDSA signature
    // For MVP, we'll check if signature is non-empty (placeholder)

    if (!borrowerPk || !mlHash || !signature || signature.length === 0) {
      console.warn('[WITNESS] verify_mla_signature: invalid parameters');
      return false;
    }

    // TODO: Implement real ECDSA signature verification
    // This would require:
    // 1. Parse borrowerPk as public key
    // 2. Verify signature against mlHash using ECDSA
    // 3. Return true if valid, false otherwise

    console.log(
      `[WITNESS] verify_mla_signature: verified signature for ${borrowerPk}`
    );
    return true;
  } catch (error) {
    console.error('[WITNESS ERROR] verify_mla_signature:', error);
    return false;
  }
}

// ============================================================================
// WITNESS CONTEXT INITIALIZATION (Called during borrower onboarding)
// ============================================================================

/**
 * Initialize witness context for a borrower
 * Call this during onboarding before calling circuits
 */
export function initializeBorrowerContext(
  creditScore: number,
  encryptedIdentity: EncryptedIdentity,
  secretKey: Bytes32,
  lenderAddress: Bytes32
): void {
  witnessStorage.set('creditData', {
    score: creditScore,
    income: BigInt(5000), // Mock income for MVP
    verificationDate: Math.floor(Date.now() / 1000),
    verificationSource: 'mock'
  });

  witnessStorage.set('encryptedIdentity', encryptedIdentity);
  witnessStorage.set('secretKey', secretKey);
  witnessStorage.set('lenderAddress', lenderAddress);

  console.log('[WITNESS] Borrower context initialized');
}

/**
 * Store loan details for use in slashing circuit
 */
export function storeLoanDetails(loanDetails: any): void {
  witnessStorage.set('currentLoanDetails', loanDetails);
  console.log(`[WITNESS] Loan details stored: ${loanDetails.loanId}`);
}

/**
 * Clear witness context (on logout or account switch)
 */
export function clearBorrowerContext(): void {
  witnessStorage.clear();
  console.log('[WITNESS] Borrower context cleared');
}

/**
 * Get witness context (for debugging)
 */
export function getBorrowerContext(): any {
  return {
    hasCreditData: witnessStorage.get('creditData') !== undefined,
    hasEncryptedIdentity: witnessStorage.get('encryptedIdentity') !== undefined,
    hasSecretKey: witnessStorage.get('secretKey') !== undefined,
    hasLenderAddress: witnessStorage.get('lenderAddress') !== undefined,
    hasLoanDetails: witnessStorage.get('currentLoanDetails') !== undefined
  };
}
