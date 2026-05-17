import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { logger } from './logger';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: process.env.DATABASE_PATH || './credipro.sqlite',
    driver: sqlite3.Database,
  });

  logger.info('[DB] SQLite database connection established');

  await initializeSchema(dbInstance);

  return dbInstance;
}

async function initializeSchema(db: Database) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS borrowers (
      id TEXT PRIMARY KEY,
      score INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identities (
      borrower_id TEXT PRIMARY KEY,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      salt TEXT NOT NULL,
      authTag TEXT NOT NULL,
      algorithm TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oracle_votes (
      loan_id TEXT NOT NULL,
      oracle_member_id TEXT NOT NULL,
      PRIMARY KEY (loan_id, oracle_member_id)
    );
  `);
  
  logger.info('[DB] SQLite schema initialized');
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    logger.info('[DB] SQLite database connection closed');
  }
}
