import { Router, Response, RequestHandler } from 'express';
import { client } from '../config/client';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { toBytes32, RequestLoanResponse, TriggerSlashingResponse, LoanRecord } from '../types';

export function createLoanRouter(authMiddleware: RequestHandler): Router {
  const router = Router();

  router.post('/loan/request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { loanAmount, poolAddress, defaultTermDays } = req.body;

      if (!loanAmount || !poolAddress || !defaultTermDays) {
        res.status(400).json({ error: 'Missing required fields: loanAmount, poolAddress, defaultTermDays' });
        return;
      }

      const result: RequestLoanResponse = await client.requestLoan(
        BigInt(loanAmount),
        toBytes32(poolAddress),
        BigInt(defaultTermDays),
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('[SERVER] POST /api/loan/request error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  router.post('/loan/slash', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { loanId } = req.body;

      if (!loanId) {
        res.status(400).json({ error: 'Missing required field: loanId' });
        return;
      }

      const result: TriggerSlashingResponse = await client.triggerSlashing(toBytes32(loanId));

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('[SERVER] POST /api/loan/slash error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  router.get('/loan/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const loan: LoanRecord | null = await client.getLoanDetails(toBytes32(req.params.id));

      if (loan) {
        res.json({
          ...loan,
          disbursedAmount: loan.disbursedAmount.toString(),
          defaultThreshold: loan.defaultThreshold.toString(),
        });
      } else {
        res.status(404).json({ error: 'Loan not found' });
      }
    } catch (error) {
      logger.error('[SERVER] GET /api/loan/:id error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  router.get('/pool/:address', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pool = await client.getPoolDetails(toBytes32(req.params.address));

      if (pool) {
        res.json({
          tvl: pool.tvl.toString(),
          riskParams: {
            minCreditScore: pool.riskParams.minCreditScore,
            maxLTV: pool.riskParams.maxLTV,
            minMonthlyIncome: pool.riskParams.minMonthlyIncome.toString(),
            maxLoanAmount: pool.riskParams.maxLoanAmount.toString(),
          },
        });
      } else {
        res.status(404).json({ error: 'Pool not found' });
      }
    } catch (error) {
      logger.error('[SERVER] GET /api/pool/:address error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  return router;
}
