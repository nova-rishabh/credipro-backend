import { logger } from '../lib/logger';
let providers: any = null;
import type { Bytes32 } from '../types';

const RPC_ENV = process.env.MIDNIGHT_RPC || '';

let provider: any = null;
let contractClient: any = null;

export async function connectMidnight(): Promise<void> {
  if (!RPC_ENV) {
    throw new Error('MIDNIGHT_RPC is not set');
  }

  if (provider) return;

  logger.info('[MIDNIGHT] Connecting to Midnight RPC', { rpc: RPC_ENV });

  // Dynamically import SDK to avoid ESM/CJS load errors in test env
  providers = await import('@midnight-ntwrk/midnight-js-contracts');

  // Try common exported factory names
  if (typeof providers.createProvider === 'function') {
    provider = await providers.createProvider({ url: RPC_ENV });
  } else if (typeof providers.createClient === 'function') {
    provider = await providers.createClient({ url: RPC_ENV });
  } else if (typeof providers.Provider === 'function') {
    // constructor-style
    provider = new providers.Provider(RPC_ENV);
  } else {
    throw new Error('Unsupported midnight-js-contracts API shape');
  }
}

export async function getContractClient(contractAddress: Bytes32): Promise<any> {
  if (!provider) await connectMidnight();
  if (!contractAddress) throw new Error('Contract address required');

  // Create a contract client instance for the given address
  const addr = typeof contractAddress === 'string' ? contractAddress : String(contractAddress);

  if (providers.ContractClient && typeof providers.ContractClient.create === 'function') {
    contractClient = await providers.ContractClient.create(provider, addr);
    return contractClient;
  }

  if (provider.getContract) {
    contractClient = await provider.getContract(addr);
    return contractClient;
  }

  if (typeof providers.createContractClient === 'function') {
    contractClient = await providers.createContractClient(provider, addr);
    return contractClient;
  }

  throw new Error('Unable to construct contract client from midnight-js-contracts');
}

export async function callProvableCircuit(contractAddress: Bytes32, name: string, args: unknown[], timeoutMs = 30000): Promise<any> {
  const client = await getContractClient(contractAddress);

  // Wrap call in timeout
  return await Promise.race([
    client.callProvableCircuit(name, ...args),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Midnight call timeout')), timeoutMs)),
  ]);
}

export async function readLedgerMap(contractAddress: Bytes32, mapName: string, key: unknown): Promise<any> {
  const client = await getContractClient(contractAddress);
  return client.readLedgerMap(mapName, key);
}

export async function getContractCode(contractAddress: Bytes32): Promise<string | null> {
  if (!provider) await connectMidnight();
  try {
    return await provider.getCode(contractAddress as unknown as string);
  } catch (e) {
    logger.warn('[MIDNIGHT] getCode failed', e);
    return null;
  }
}
