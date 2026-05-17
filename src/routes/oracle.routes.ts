import { Router, Response, RequestHandler } from 'express';
import { client } from '../config/client';
import { mockOracleService } from '../services/oracle';
import { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { toBytes32 } from '../types';

function oracleThresholds(): { totalMembers: number; threshold: number } {
  const totalMembers = process.env.ORACLE_MEMBER_COUNT ? parseInt(process.env.ORACLE_MEMBER_COUNT, 10) : 3;
  const threshold = process.env.ORACLE_THRESHOLD ? parseInt(process.env.ORACLE_THRESHOLD, 10) : 2;
  return { totalMembers, threshold };
}

export function createOracleRouter(authMiddleware: RequestHandler): Router {
  const router = Router();

  router.post('/oracle/vote', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { loanId, oracleMemberId } = req.body;

      if (!loanId || !oracleMemberId) {
        res.status(400).json({ error: 'Missing required fields: loanId, oracleMemberId' });
        return;
      }

      const consensus = await mockOracleService.voteApproval(toBytes32(loanId), oracleMemberId);
      const approvalCount = await mockOracleService.getApprovalCount(toBytes32(loanId));
      const { totalMembers, threshold } = oracleThresholds();

      res.json({
        success: true,
        consensusReached: consensus,
        approvalCount,
        threshold,
        totalMembers,
      });
    } catch (error) {
      logger.error('[SERVER] POST /api/oracle/vote error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  router.get('/oracle/approvals/:loanId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const approvals = await client.getOracleApprovals(toBytes32(req.params.loanId));
      const { totalMembers, threshold } = oracleThresholds();

      res.json({
        loanId: req.params.loanId,
        approvalCount: approvals,
        threshold,
        totalMembers,
      });
    } catch (error) {
      logger.error('[SERVER] GET /api/oracle/approvals/:loanId error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  router.get('/oracle/members', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
    const members = mockOracleService.getOracleMembers();
    res.json({ members });
  });

  return router;
}
