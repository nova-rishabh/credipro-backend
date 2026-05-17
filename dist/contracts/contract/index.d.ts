import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type PublicRiskParam = { minCreditScore: bigint;
                                maxLTV: bigint;
                                minMonthlyIncome: bigint
                              };

export type LoanIdentityRecord = { identityHash: Uint8Array;
                                   loanId: Uint8Array;
                                   lenderAddress: Uint8Array;
                                   disbursedAmount: bigint;
                                   disbursalTimestamp: bigint;
                                   defaultThreshold: bigint;
                                   isDefaulted: boolean
                                 };

export type Witnesses<PS> = {
  mock_zkTLS_CreditScore(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  read_Identity_NFC(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  compute_identity_hash(context: __compactRuntime.WitnessContext<Ledger, PS>,
                        passport_data_0: Uint8Array): [PS, Uint8Array];
  get_lender_address(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  check_default_deadline_exceeded(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, boolean];
  verify_mla_signature(context: __compactRuntime.WitnessContext<Ledger, PS>,
                       borrower_pk_0: Uint8Array,
                       mla_hash_0: Uint8Array,
                       signature_0: Uint8Array): [PS, boolean];
}

export type ImpureCircuits<PS> = {
  requestLoan(context: __compactRuntime.CircuitContext<PS>,
              loanAmount_0: bigint,
              poolAddress_0: Uint8Array,
              defaultTermDays_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  triggerSlashing(context: __compactRuntime.CircuitContext<PS>,
                  loanId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify_master_loan_agreement(context: __compactRuntime.CircuitContext<PS>,
                               borrower_pk_0: Uint8Array,
                               mla_hash_0: Uint8Array,
                               signature_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  requestLoan(context: __compactRuntime.CircuitContext<PS>,
              loanAmount_0: bigint,
              poolAddress_0: Uint8Array,
              defaultTermDays_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  triggerSlashing(context: __compactRuntime.CircuitContext<PS>,
                  loanId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  requestLoan(context: __compactRuntime.CircuitContext<PS>,
              loanAmount_0: bigint,
              poolAddress_0: Uint8Array,
              defaultTermDays_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  triggerSlashing(context: __compactRuntime.CircuitContext<PS>,
                  loanId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verify_master_loan_agreement(context: __compactRuntime.CircuitContext<PS>,
                               borrower_pk_0: Uint8Array,
                               mla_hash_0: Uint8Array,
                               signature_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  liquidityPools: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  publicRiskParameters: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): PublicRiskParam;
    [Symbol.iterator](): Iterator<[Uint8Array, PublicRiskParam]>
  };
  encryptedIdentityCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): LoanIdentityRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, LoanIdentityRecord]>
  };
  oracleCommitteeSignatures: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
