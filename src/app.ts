import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './lib/logger';
import { contractAddress } from './config/client';
import { createAuthMiddleware } from './middleware/auth';
import { createAuthRouter } from './routes/auth.routes';
import { createHealthRouter } from './routes/health.routes';
import { createLoanRouter } from './routes/loan.routes';
import { createOracleRouter } from './routes/oracle.routes';

if (!process.env.JWT_SECRET) {
  logger.error('[SERVER] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!process.env.CREDIPRO_ENCRYPTION_KEY) {
  logger.error('[SERVER] FATAL: CREDIPRO_ENCRYPTION_KEY environment variable is required');
  process.exit(1);
}

const JWT_SECRET: string = process.env.JWT_SECRET;
const authMiddleware = createAuthMiddleware(JWT_SECRET);

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', createAuthRouter(JWT_SECRET));
app.use('/api', createHealthRouter(contractAddress));
app.use('/api', createLoanRouter(authMiddleware));
app.use('/api', createOracleRouter(authMiddleware));

export default app;
