import { Router, Request, Response } from 'express';
import { Bytes32 } from '../types';

export function createHealthRouter(contractAddress: Bytes32): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      contractAddress,
      mockMode: process.env.MOCK_ORACLE_MODE !== 'false',
    });
  });

  return router;
}
