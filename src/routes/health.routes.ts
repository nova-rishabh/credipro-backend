import { Router, Request, Response } from 'express';
import { Bytes32 } from '../types';
import * as path from 'path';
import * as fs from 'fs';
import { getMode, getMissingEnvVars } from '../lib/appMode';

export function createHealthRouter(contractAddress: Bytes32): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    // Report whether compiled contract artifacts are present
    const contractModulePath = path.join(__dirname, '../../contracts/contract/index.js');
    const contractPresent = fs.existsSync(contractModulePath);

    let contractConnected = false;
    if (process.env.USE_ONCHAIN_CONTRACT === 'true') {
      try {
        const midnight = await import('../services/midnightClient');
        const code = await midnight.getContractCode(contractAddress);
        contractConnected = !!code;
      } catch (e) {
        contractConnected = false;
      }
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      contractAddress,
      mode: getMode(),
      mockMode: getMode() === 'demo',
      compiledContractPresent: contractPresent,
      contractConnected,
      missingEnvVars: getMissingEnvVars(),
    });
  });

  return router;
}
