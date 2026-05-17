/**
 * Credipro Core Types & Interfaces
 *
 * Defines the fundamental data structures for the Credipro protocol:
 * - Witness inputs (credit scores, identity data)
 * - Loan records and oracle state
 * - Circuit parameters and return values
 */

export interface CreditData {
  score: number;           // FICO equivalent (0-850)
  income: bigint;          // Monthly income in smallest denomination
  verificationDate: number; // Unix timestamp
  verificationSource: string; // "mock" | "zkTLS" | "reclaim"
}

export interface IdentityData {
  firstName: string;
  lastName: string;
  passportId: string;
  dateOfBirth: string;      // ISO 8601 format
  nationalId: string;
  biometricHash: string;    // Biometric template hash (not revealed)
}

export interface EncryptedIdentity {
  ciphertext: string;       // Encrypted identity JSON (hex-encoded)
  iv: string;               // Initialization vector (hex-encoded)
  salt: string;             // Key derivation salt (hex-encoded)
  authTag: string;          // GCM authentication tag (hex-encoded)
  algorithm: string;        // "aes-256-gcm" or similar
}

export interface LoanRecord {
  loanId: Bytes32;
  identityHash: Bytes32;
  lenderAddress: Bytes32;
  borrowerPublicKey: Bytes32;
  disbursedAmount: bigint;  // Uint<64>
  disbursalTimestamp: number; // Unix timestamp
  defaultThreshold: bigint;  // Days until default
  isDefaulted: boolean;
  interestRate: number;     // BPS (e.g., 500 = 5%)
}

export interface PublicRiskParam {
  minCreditScore: number;     // 0-850
  maxLTV: number;             // 0-100%
  minMonthlyIncome: bigint;   // Uint<64>
  maxLoanAmount: bigint;      // Uint<64>
}

export interface CircuitInputs {
  loanAmount: bigint;
  poolAddress: Bytes32;
  defaultTermDays: bigint;
  borrowerPK: Bytes32;
  mlaSigned: boolean;
}

export interface CircuitOutput {
  success: boolean;
  loanId: Bytes32;
  proof: string;              // ZK proof (hex-encoded)
  publicInputs: string[];     // Public inputs to proof
}

export interface OracleVote {
  loanId: Bytes32;
  oracleMemberId: string;
  approved: boolean;
  timestamp: number;
  signature: string;          // Signature of vote
}

export interface DefaultResolution {
  loanId: Bytes32;
  approvalCount: number;      // 0-3
  approved: boolean;          // true if >= 2
  decryptedIdentity?: IdentityData; // Only after resolution
}

/**
 * Bytes32 type alias for clarity
 */
export type Bytes32 = string & { readonly __bytes32: true };

export function toBytes32(hex: string): Bytes32 {
  if (!hex.startsWith("0x")) {
    hex = "0x" + hex;
  }
  if (hex.length !== 66) {
    throw new Error(`Invalid Bytes32: expected 66 chars, got ${hex.length}`);
  }
  return hex as Bytes32;
}

/**
 * Contract state interface
 */
export interface ContractState {
  liquidityPools: Map<Bytes32, bigint>;
  publicRiskParameters: Map<Bytes32, PublicRiskParam>;
  encryptedIdentityCommitments: Map<Bytes32, LoanRecord>;
  oracleCommitteeSignatures: Map<Bytes32, number>;
}

/**
 * Witness context for circuit execution
 */
export interface WitnessContext {
  creditScore: number;
  encryptedIdentity: EncryptedIdentity;
  identityHash: Bytes32;
  lenderAddress: Bytes32;
  borrowerSecretKey: Bytes32;
  defaultThresholdExceeded: boolean;
}

/**
 * Request/Response types for API
 */
export interface RequestLoanRequest {
  loanAmount: string;         // BigInt as string
  poolAddress: string;
  defaultTermDays: string;    // BigInt as string
  mlaSigned: boolean;
  mlaSigning: string;         // Signature of MLA
}

export interface RequestLoanResponse {
  success: boolean;
  loanId?: string;
  error?: string;
  proof?: string;
  gasUsed?: string;
}

export interface TriggerSlashingRequest {
  loanId: string;
  oracleVote?: OracleVote;
}

export interface TriggerSlashingResponse {
  success: boolean;
  marked: boolean;            // Whether loan was marked as defaulted
  error?: string;
  gasUsed?: string;
}

export enum LoanStatus {
  PENDING = "pending",
  APPROVED = "approved",
  ACTIVE = "active",
  DEFAULTED = "defaulted",
  REPAID = "repaid",
  CANCELLED = "cancelled"
}
