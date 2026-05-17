import { Router, Request, Response } from 'express';
import { Bytes32 } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export function createHealthRouter(contractAddress: Bytes32): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    // Report whether compiled contract artifacts are present
    const contractModulePath = path.join(__dirname, '../../contracts/contract/index.js');
    const contractPresent = fs.existsSync(contractModulePath);

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      contractAddress,
      mockMode: process.env.MOCK_ORACLE_MODE !== 'false',
      compiledContractPresent: contractPresent,
    });
  });

  return router;
}
