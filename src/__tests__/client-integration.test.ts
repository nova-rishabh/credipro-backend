import fs from 'fs';
import path from 'path';

import { createCrediproClient } from '../services/contract';
import { toBytes32 } from '../types';
import type { MockOracleService } from '../services/oracle';

const contractModulePath = path.join(__dirname, '../../contracts/contract/index.js');
const describeContract = fs.existsSync(contractModulePath) ? describe : describe.skip;

describeContract('CrediproClient integration with compiled contract', () => {
  it('requestLoan returns loanId when compiled contract is present', async () => {
    const client = await createCrediproClient(toBytes32('0x' + '0'.repeat(64)), {} as any, undefined as unknown as MockOracleService);

    // Initialize borrower context so witnesses have data
    await client.initializeBorrower(750, { ciphertext: '01'.repeat(32), iv: '00'.repeat(12), salt: '00'.repeat(12), authTag: '00'.repeat(16), algorithm: 'aes-256-gcm' }, toBytes32('0x' + 'a'.repeat(64)), toBytes32('0x' + 'b'.repeat(64)));

    const res = await client.requestLoan(BigInt(1000), toBytes32('0x' + 'b'.repeat(64)), BigInt(180));

    expect(res.success).toBe(true);
    expect(res.loanId).toBeDefined();
    if (res.loanId) expect((res.loanId as string).startsWith('0x')).toBe(true);
  }, 20000);
});
