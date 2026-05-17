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
import { createModeRouter } from './routes/mode.routes';
import { isDemo } from './lib/appMode';

if (!process.env.JWT_SECRET) {
  if (!isDemo()) {
    logger.error('[SERVER] FATAL: JWT_SECRET environment variable is required');
    process.exit(1);
  }
  logger.warn('[SERVER] JWT_SECRET not set — running in demo mode with auto-generated fallback');
}

if (!process.env.CREDIPRO_ENCRYPTION_KEY) {
  if (!isDemo()) {
    logger.error('[SERVER] FATAL: CREDIPRO_ENCRYPTION_KEY environment variable is required');
    process.exit(1);
  }
  logger.warn('[SERVER] CREDIPRO_ENCRYPTION_KEY not set — running in demo mode with fallback key');
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'demo-secret-key-not-for-production';
const authMiddleware = createAuthMiddleware(JWT_SECRET);

const app = express();

app.use(helmet());
app.use(cors());
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

app.use('/api', createAuthRouter(JWT_SECRET));
app.use('/api', createHealthRouter(contractAddress));
app.use('/api', createLoanRouter(authMiddleware));
app.use('/api', createOracleRouter(authMiddleware));
app.use('/api', createModeRouter());

export default app;
