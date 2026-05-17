import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { CrediproClient } from './contract';
import { mockOracleService } from './oracle';
import { toBytes32, RequestLoanResponse, TriggerSlashingResponse, LoanRecord } from './types';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('[SERVER] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!process.env.CREDIPRO_ENCRYPTION_KEY) {
  console.error('[SERVER] FATAL: CREDIPRO_ENCRYPTION_KEY environment variable is required');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET: string = process.env.JWT_SECRET;

// 1. Enable CORS with specific origins and settings before other middleware
app.use(cors({
  origin: [
    'https://credipro-frontend-production.up.railway.app',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// 2. Handle preflight requests explicitly
app.options('*', cors());

// 3. helmet after cors
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Ensure BigInt and Uint8Array values are safely serialized to JSON
app.set('json replacer', (_key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return '0x' + Buffer.from(value).toString('hex');
  }
  return value;
});

export interface AuthenticatedRequest extends Request {
  user?: any;
}

// Resolve contract address safely at startup. toBytes32 throws on invalid input,
// so catch errors and fall back to a default bytes32 value to avoid crashing
// the server during import when env vars are misconfigured.
let contractAddress;
try {
  if (process.env.MIDNIGHT_CONTRACT_ADDRESS) {
    contractAddress = toBytes32(process.env.MIDNIGHT_CONTRACT_ADDRESS);
  } else {
    contractAddress = toBytes32('0x' + '1'.repeat(64));
  }
} catch (err) {
  // Log a warning and use a safe default so the server can start in dev
  console.warn('[SERVER] Invalid MIDNIGHT_CONTRACT_ADDRESS, falling back to default bytes32:',
    err instanceof Error ? err.message : err);
  contractAddress = toBytes32('0x' + '1'.repeat(64));
}

const client = new CrediproClient(contractAddress, {}, mockOracleService);

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.DISABLE_AUTH === 'true') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/api/auth/token', (req: Request, res: Response) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    res.status(400).json({ error: 'Missing or invalid username' });
    return;
  }
  const token = jwt.sign({ username: username.trim(), role: 'borrower' }, JWT_SECRET, {
    expiresIn: '24h',
  });
  res.json({ token });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    contractAddress,
    mockMode: process.env.MOCK_ORACLE_MODE !== 'false',
  });
});

app.post('/api/loan/request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
    console.error('[SERVER] POST /api/loan/request error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

app.post('/api/loan/slash', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
    console.error('[SERVER] POST /api/loan/slash error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

app.get('/api/loan/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
    console.error('[SERVER] GET /api/loan/:id error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

app.get('/api/pool/:address', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pool = await client.getPoolDetails(toBytes32(req.params.address));

    if (pool) {
      res.json({
        tvl: pool.tvl.toString(),
        riskParams: {
          ...pool.riskParams,
          minMonthlyIncome: pool.riskParams.minMonthlyIncome.toString(),
          maxLoanAmount: pool.riskParams.maxLoanAmount.toString(),
        },
      });
    } else {
      res.status(404).json({ error: 'Pool not found' });
    }
  } catch (error) {
    console.error('[SERVER] GET /api/pool/:address error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

app.post('/api/oracle/vote', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { loanId, oracleMemberId } = req.body;

    if (!loanId || !oracleMemberId) {
      res.status(400).json({ error: 'Missing required fields: loanId, oracleMemberId' });
      return;
    }

    const consensus = mockOracleService.voteApproval(toBytes32(loanId), oracleMemberId);
    const approvalCount = mockOracleService.getApprovalCount(toBytes32(loanId));

    res.json({
      success: true,
      consensusReached: consensus,
      approvalCount,
      threshold: 2,
      totalMembers: 3,
    });
  } catch (error) {
    console.error('[SERVER] POST /api/oracle/vote error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

app.get('/api/oracle/approvals/:loanId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const approvals = await client.getOracleApprovals(toBytes32(req.params.loanId));

    res.json({
      loanId: req.params.loanId,
      approvalCount: approvals,
      threshold: 2,
      totalMembers: 3,
    });
  } catch (error) {
    console.error('[SERVER] GET /api/oracle/approvals/:loanId error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

app.get('/api/oracle/members', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  const members = mockOracleService.getOracleMembers();
  res.json({ members });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[SERVER] Credipro backend running on port ${PORT}`);
    console.log(`[SERVER] Mock mode: ${process.env.MOCK_ORACLE_MODE !== 'false'}`);
    console.log(`[SERVER] Contract address: ${contractAddress}`);
  });
}

export default app;
