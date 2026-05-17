import { logger } from './logger';
import { getDb } from './db';

export type AppMode = 'demo' | 'production';

let currentMode: AppMode = 'demo';

export function getMode(): AppMode {
  return currentMode;
}

export function isDemo(): boolean {
  return currentMode === 'demo';
}

export function isProduction(): boolean {
  return currentMode === 'production';
}

export function setMode(mode: AppMode): { success: boolean; error?: string } {
  if (mode === 'production') {
    const missing: string[] = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.CREDIPRO_ENCRYPTION_KEY) missing.push('CREDIPRO_ENCRYPTION_KEY');
    if (!process.env.MIDNIGHT_CONTRACT_ADDRESS) missing.push('MIDNIGHT_CONTRACT_ADDRESS');
    if (missing.length > 0) {
      return { success: false, error: `Missing required env vars for production: ${missing.join(', ')}` };
    }
  }

  currentMode = mode;
  logger.info(`[MODE] Switched to ${mode} mode`);

  if (mode === 'demo') {
    seedDemoData();
  }

  return { success: true };
}

async function seedDemoData(): Promise<void> {
  try {
    const db = await getDb();
    const existing = await db.get('SELECT id FROM borrowers WHERE id = ?', 'demo-borrower');
    if (existing) {
      logger.info('[MODE] Demo data already seeded');
      return;
    }
    await db.run('INSERT OR IGNORE INTO borrowers (id, score) VALUES (?, ?)', 'demo-borrower', 720);
    await db.run('INSERT OR IGNORE INTO borrowers (id, score) VALUES (?, ?)', 'borrower-1', 680);
    logger.info('[MODE] Demo data seeded successfully');
  } catch (e) {
    logger.warn('[MODE] Failed to seed demo data (DB may not be ready yet):', e);
  }
}

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.CREDIPRO_ENCRYPTION_KEY) missing.push('CREDIPRO_ENCRYPTION_KEY');
  if (!process.env.MIDNIGHT_CONTRACT_ADDRESS) missing.push('MIDNIGHT_CONTRACT_ADDRESS');
  return missing;
}
