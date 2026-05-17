/**
 * Credipro SDK Main Entry Point
 *
 * Exports all public APIs for interacting with the Credipro protocol
 */

// Types
export * from './types';

// Core Modules
export { CrediproClient, createCrediproClient } from './contract';
export {
  mock_zkTLS_CreditScore,
  read_Identity_NFC,
  compute_identity_hash,
  local_secret_key,
  get_lender_address,
  get_loan_details,
  check_default_deadline_exceeded,
  verify_mla_signature,
  initializeBorrowerContext,
  storeLoanDetails,
  clearBorrowerContext,
  getBorrowerContext
} from './prover';

// Oracle Service
export {
  MockCreditBureau,
  MockIdentityProvider,
  OracleCommittee,
  MockOracleService
} from './oracle';

// Version
export const VERSION = '1.0.0';

console.log(`[SDK] Credipro SDK loaded (v${VERSION})`);
