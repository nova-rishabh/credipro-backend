import { CrediproClient } from '../services/contract';
import { mockOracleService } from '../services/oracle';
import { toBytes32, Bytes32 } from '../types';
import { logger } from '../lib/logger';

export function resolveContractAddress(): Bytes32 {
  try {
    if (process.env.MIDNIGHT_CONTRACT_ADDRESS) {
      return toBytes32(process.env.MIDNIGHT_CONTRACT_ADDRESS);
    }
    return toBytes32('0x' + '1'.repeat(64));
  } catch (err) {
    logger.warn(
      '[SERVER] Invalid MIDNIGHT_CONTRACT_ADDRESS, falling back to default bytes32:',
      err instanceof Error ? err.message : err,
    );
    return toBytes32('0x' + '1'.repeat(64));
  }
}

export const contractAddress = resolveContractAddress();
export const client = new CrediproClient(contractAddress, {}, mockOracleService);
