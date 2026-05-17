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

  // Demo helper: clear votes for a loan
  router.post('/oracle/clear/:loanId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { loanId } = req.params;
      if (!loanId) {
        res.status(400).json({ error: 'Missing loanId param' });
        return;
      }
      await mockOracleService.getApprovalCount(toBytes32(loanId)); // ensure valid bytes32
      const committee = (mockOracleService as any).oracleCommittee;
      if (committee && typeof committee.clearVotes === 'function') {
        await committee.clearVotes(toBytes32(loanId));
      }
      res.json({ success: true, cleared: true, loanId });
    } catch (error) {
      logger.error('[SERVER] POST /api/oracle/clear/:loanId error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Demo helper: auto-vote by oracle-1 and oracle-2 (demo-only)
  router.post('/oracle/auto-vote/:loanId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (process.env.MOCK_ORACLE_MODE !== 'true') {
        res.status(403).json({ error: 'Auto-vote is only available in MOCK_ORACLE_MODE=true' });
        return;
      }
      const { loanId } = req.params;
      if (!loanId) {
        res.status(400).json({ error: 'Missing loanId param' });
        return;
      }
      const id = toBytes32(loanId);
      await mockOracleService.voteApproval(id, 'oracle-1');
      await mockOracleService.voteApproval(id, 'oracle-2');
      const approvalCount = await mockOracleService.getApprovalCount(id);
      res.json({ success: true, approvalCount, loanId });
    } catch (error) {
      logger.error('[SERVER] POST /api/oracle/auto-vote/:loanId error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Demo helper: reveal decrypted identity if threshold reached
  router.get('/oracle/revealed-identity/:loanId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { loanId } = req.params;
      if (!loanId) {
        res.status(400).json({ error: 'Missing loanId param' });
        return;
      }
      const id = toBytes32(loanId);
      const approvals = await mockOracleService.getApprovalCount(id);
      const threshold = process.env.ORACLE_THRESHOLD ? parseInt(process.env.ORACLE_THRESHOLD, 10) : 2;
      if (approvals < threshold) {
        res.status(403).json({ error: 'Consensus not reached', approvalCount: approvals, threshold });
        return;
      }
      // Fetch encrypted identity for borrower-1 and decrypt it
      const encrypted = await mockOracleService.getEncryptedIdentity('borrower-1');
      const identity = mockOracleService.decryptIdentity(encrypted);
      res.json({ success: true, identity, approvalCount: approvals, threshold });
    } catch (error) {
      logger.error('[SERVER] GET /api/oracle/revealed-identity/:loanId error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Demo helper: full reset (wipe mock DB tables)
  router.delete('/oracle/reset', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      await mockOracleService.clearAllData();
      res.json({ success: true, reset: true });
    } catch (error) {
      logger.error('[SERVER] DELETE /api/oracle/reset error:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  return router;
}
