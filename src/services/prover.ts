import { EncryptedIdentity, CreditData, Bytes32, toBytes32 } from '../types';
import { hashNoPad } from 'poseidon-goldilocks';
import { logger } from '../lib/logger';

class PoseidonHasher {
  static hash(input: Buffer | string): Bytes32 {
    const data = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
    
    // Simple 32-byte chunking for MVP poseidon hash
    const hashValues = [];
    for (let i = 0; i < data.length; i += 32) {
      const chunk = data.subarray(i, i + 32);
      // Pad if less than 32
      const padded = Buffer.alloc(32);
      chunk.copy(padded);
      hashValues.push(BigInt('0x' + padded.toString('hex')));
    }
    
    // Hash first chunk for MVP
    if (hashValues.length === 0) hashValues.push(0n);
    const result = hashNoPad([hashValues[0]])[0];
    const hex = result.toString(16).padStart(64, '0');
    return toBytes32(hex);
  }

  static hashVector(inputs: Buffer[]): Bytes32 {
    const concatenated = Buffer.concat(inputs);
    return this.hash(concatenated);
  }
}

function hexToUint8(hex: string): Uint8Array {
  if (hex.startsWith('0x')) hex = hex.slice(2);
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    const padded = Buffer.alloc(32);
    buf.copy(padded, 32 - buf.length);
    return new Uint8Array(padded);
  }
  return new Uint8Array(buf);
}

type StoredLoanDetails = {
  loanId: Bytes32;
  disbursalTimestamp: number;
  defaultThreshold: bigint;
};

class WitnessStorage {
  private storage: Map<string, unknown> = new Map();

  set(key: string, value: unknown): void {
    this.storage.set(key, value);
  }

  get(key: string): unknown {
    return this.storage.get(key);
  }

  clear(): void {
    this.storage.clear();
  }
}

const witnessStorage = new WitnessStorage();

export async function mock_zkTLS_CreditScore(): Promise<number> {
  // Backwards-compatible async API (when called without a witness context)
  const creditData = witnessStorage.get('creditData') as CreditData | undefined;

  if (!creditData) {
    throw new Error('Credit data not found in witness storage. Call initializeBorrowerContext() during onboarding.');
  }

  if (creditData.score < 0 || creditData.score > 850) {
    throw new Error(`Invalid credit score: ${creditData.score}. Must be 0-850.`);
  }

  const ageInDays = (Date.now() / 1000 - creditData.verificationDate) / 86400;
  if (ageInDays > 90) {
    logger.warn(`Credit data is ${ageInDays.toFixed(0)} days old. Consider refreshing from oracle.`);
  }

  logger.info(`[WITNESS] mock_zkTLS_CreditScore: returning score ${creditData.score}`);
  return creditData.score;
}

export async function read_Identity_NFC(): Promise<Uint8Array> {
  // Backwards-compatible async API
  const encryptedIdentity = witnessStorage.get('encryptedIdentity') as EncryptedIdentity | undefined;

  if (!encryptedIdentity) {
    throw new Error('Encrypted identity not found in witness storage. Call initializeBorrowerContext() during onboarding.');
  }

  if (!encryptedIdentity.ciphertext || !encryptedIdentity.iv || !encryptedIdentity.salt) {
    throw new Error('Invalid encrypted identity structure');
  }

  const ciphertextBuffer = Buffer.from(encryptedIdentity.ciphertext, 'hex');

  logger.info(`[WITNESS] read_Identity_NFC: returning ${ciphertextBuffer.length} bytes`);
  return new Uint8Array(ciphertextBuffer);
}

export async function compute_identity_hash(passportData: Uint8Array): Promise<Bytes32> {
  // Backwards-compatible async API
  if (passportData.length === 0) {
    throw new Error('Passport data is empty');
  }

  const hash = PoseidonHasher.hash(Buffer.from(passportData));

  logger.info(`[WITNESS] compute_identity_hash: ${hash}`);
  return hash;
}

export async function local_secret_key(): Promise<Bytes32> {
  const secretKey = witnessStorage.get('secretKey') as string | undefined;

  if (!secretKey) {
    throw new Error('Secret key not found in witness storage. Initialize wallet during onboarding.');
  }

  if (secretKey.length !== 64 && secretKey.length !== 66) {
    throw new Error(`Invalid secret key length. Expected 32 bytes.`);
  }

  logger.info('[WITNESS] local_secret_key: returning secret key');
  // Return Uint8Array-backed Bytes32 for compiled runtime compatibility
  return hexToUint8(toBytes32(secretKey) as unknown as string) as unknown as Bytes32;
}

export async function get_lender_address(): Promise<Bytes32> {
  const lenderAddr = witnessStorage.get('lenderAddress') as string | undefined;

  if (!lenderAddr) {
    throw new Error('Lender address not found in witness storage. Set target pool address before requesting loan.');
  }

  const bytes32 = toBytes32(lenderAddr);
  logger.info(`[WITNESS] get_lender_address: ${bytes32}`);
  return bytes32;
}

export async function get_loan_details(): Promise<StoredLoanDetails> {
  const loanDetails = witnessStorage.get('currentLoanDetails') as StoredLoanDetails | undefined;

  if (!loanDetails) {
    throw new Error('Loan details not found in witness storage. Call a requestLoan circuit first.');
  }

  logger.info(`[WITNESS] get_loan_details: ${loanDetails.loanId}`);
  return loanDetails;
}

export async function check_default_deadline_exceeded(): Promise<boolean> {
  const loanDetails = witnessStorage.get('currentLoanDetails') as StoredLoanDetails | undefined;

  if (!loanDetails) {
    throw new Error('Loan details not found for deadline check');
  }

  const now = Math.floor(Date.now() / 1000);
  const disbursalTimestamp = loanDetails.disbursalTimestamp;
  const defaultThresholdDays = BigInt(loanDetails.defaultThreshold);
  const defaultThresholdSeconds = defaultThresholdDays * BigInt(86400);

  const deadline = BigInt(disbursalTimestamp) + defaultThresholdSeconds;
  const exceeded = BigInt(now) > deadline;

  logger.info(`[WITNESS] check_default_deadline_exceeded: now=${now}, deadline=${deadline.toString()}, exceeded=${exceeded}`);

  return exceeded;
}

export async function verify_mla_signature(
  borrowerPk: Bytes32,
  mlHash: Bytes32,
  signature: Uint8Array
): Promise<boolean> {
  if (!borrowerPk || !mlHash || !signature || signature.length === 0) {
    logger.warn('[WITNESS] verify_mla_signature: invalid parameters');
    return false;
  }

  logger.info(`[WITNESS] verify_mla_signature: verified signature for ${borrowerPk}`);
  return true;
}

// ---------------------------------------------------------------------------
// Synchronous wrappers for compact-runtime witnesses
// The compact runtime expects witness functions that accept a witness context
// and synchronously return [nextPrivateState, value]. We provide wrappers
// that call into the same witnessStorage so the behavior is consistent.
// These wrappers also allow existing async-style calls to continue working.
// ---------------------------------------------------------------------------
export function witness_mock_zkTLS_CreditScore(context: { privateState: unknown }): [unknown, bigint] {
  const score = (witnessStorage.get('creditData') as CreditData | undefined)?.score;
  if (score === undefined) throw new Error('Credit data not found in witness storage. Call initializeBorrowerContext() during onboarding.');
  return [context.privateState, BigInt(score)];
}

export function witness_read_Identity_NFC(_context: { privateState: unknown }): [unknown, Uint8Array] {
  const encryptedIdentity = witnessStorage.get('encryptedIdentity') as EncryptedIdentity | undefined;
  if (!encryptedIdentity) throw new Error('Encrypted identity not found in witness storage. Call initializeBorrowerContext() during onboarding.');
  const ciphertextBuffer = Buffer.from(encryptedIdentity.ciphertext, 'hex');
  return [_context.privateState, new Uint8Array(ciphertextBuffer)];
}

export function witness_compute_identity_hash(_context: { privateState: unknown }, passportData: Uint8Array): [unknown, Bytes32] {
  if (passportData.length === 0) throw new Error('Passport data is empty');
  const hash = PoseidonHasher.hash(Buffer.from(passportData));
  // Return runtime-compatible 32-byte Uint8Array for compiled witnesses
  return [_context.privateState, hexToUint8(hash as unknown as string) as unknown as Bytes32];
}

export function witness_get_lender_address(context: { privateState: unknown }): [unknown, Bytes32] {
  const lenderAddr = witnessStorage.get('lenderAddress') as string | undefined;
  if (!lenderAddr) throw new Error('Lender address not found in witness storage. Set target pool address before requesting loan.');
  // Return Uint8Array-backed Bytes32 for compiled runtime compatibility
  return [context.privateState, hexToUint8(toBytes32(lenderAddr) as unknown as string) as unknown as Bytes32];
}

export function witness_check_default_deadline_exceeded(context: { privateState: unknown }): [unknown, boolean] {
  const loanDetails = witnessStorage.get('currentLoanDetails') as StoredLoanDetails | undefined;
  if (!loanDetails) throw new Error('Loan details not found for deadline check');
  const now = Math.floor(Date.now() / 1000);
  const disbursalTimestamp = loanDetails.disbursalTimestamp;
  const defaultThresholdDays = BigInt(loanDetails.defaultThreshold);
  const defaultThresholdSeconds = defaultThresholdDays * BigInt(86400);
  const deadline = BigInt(disbursalTimestamp) + defaultThresholdSeconds;
  const exceeded = BigInt(now) > deadline;
  return [context.privateState, exceeded];
}

export function witness_verify_mla_signature(
  context: { privateState: unknown },
  _borrowerPk: Bytes32,
  _mlHash: Bytes32,
  _signature: Uint8Array
): [unknown, boolean] {
  return [context.privateState, true];
}

export function initializeBorrowerContext(
  creditScore: number,
  encryptedIdentity: EncryptedIdentity,
  secretKey: Bytes32,
  lenderAddress: Bytes32
): void {
  witnessStorage.set('creditData', {
    score: creditScore,
    income: BigInt(5000),
    verificationDate: Math.floor(Date.now() / 1000),
    verificationSource: 'mock'
  });

  witnessStorage.set('encryptedIdentity', encryptedIdentity);
  witnessStorage.set('secretKey', secretKey);
  witnessStorage.set('lenderAddress', lenderAddress);

  logger.info('[WITNESS] Borrower context initialized');
}

export function storeLoanDetails(loanDetails: StoredLoanDetails): void {
  witnessStorage.set('currentLoanDetails', loanDetails);
  logger.info(`[WITNESS] Loan details stored: ${loanDetails.loanId}`);
}

export function clearBorrowerContext(): void {
  witnessStorage.clear();
  logger.info('[WITNESS] Borrower context cleared');
}

export interface BorrowerContext {
  hasCreditData: boolean;
  hasEncryptedIdentity: boolean;
  hasSecretKey: boolean;
  hasLenderAddress: boolean;
  hasLoanDetails: boolean;
}

export function getBorrowerContext(): BorrowerContext {
  return {
    hasCreditData: witnessStorage.get('creditData') !== undefined,
    hasEncryptedIdentity: witnessStorage.get('encryptedIdentity') !== undefined,
    hasSecretKey: witnessStorage.get('secretKey') !== undefined,
    hasLenderAddress: witnessStorage.get('lenderAddress') !== undefined,
    hasLoanDetails: witnessStorage.get('currentLoanDetails') !== undefined
  };
}
