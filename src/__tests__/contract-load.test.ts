import fs from 'fs';
import path from 'path';

import type { Witnesses } from '../../contracts/contract/index.js';

const contractModulePath = path.join(__dirname, '../../contracts/contract/index.js');
const describeContract = fs.existsSync(contractModulePath) ? describe : describe.skip;

describeContract('Compiled Compact Contract Loading Verification', () => {
  it('should successfully import and instantiate the compiled Credipro contract', async () => {
    const { Contract, ledger, pureCircuits } = await new Function("return import('../../contracts/contract/index.js')")();

    const dummyWitnesses: Witnesses<unknown> = {
      mock_zkTLS_CreditScore: (context: { privateState: unknown }) => [context.privateState, 750n],
      read_Identity_NFC: (context: { privateState: unknown }) => [context.privateState, new Uint8Array(32)],
      compute_identity_hash: (context: { privateState: unknown }, _passport: unknown) => [
        context.privateState,
        new Uint8Array(32),
      ],
      get_lender_address: (context: { privateState: unknown }) => [context.privateState, new Uint8Array(32)],
      check_default_deadline_exceeded: (context: { privateState: unknown }) => [context.privateState, false],
      verify_mla_signature: (
        context: { privateState: unknown },
        _pk: unknown,
        _hash: unknown,
        _sig: unknown,
      ) => [context.privateState, true],
    };

    const contract = new Contract(dummyWitnesses);

    expect(contract).toBeDefined();
    expect(contract.witnesses).toBe(dummyWitnesses);
    expect(contract.circuits).toBeDefined();
    expect(contract.circuits.requestLoan).toBeDefined();
    expect(contract.circuits.triggerSlashing).toBeDefined();
    expect(contract.circuits.verify_master_loan_agreement).toBeDefined();
    expect(ledger).toBeDefined();
    expect(pureCircuits).toBeDefined();
  });
});
