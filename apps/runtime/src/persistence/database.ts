import DatabaseConstructor, { Database as DatabaseType } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let dbInstance: DatabaseType | null = null;

export interface DatabaseConfig {
  dbPath?: string;
  inMemory?: boolean;
}

export function getDatabase(config: DatabaseConfig = {}): DatabaseType {
  if (dbInstance) return dbInstance;

  const resolvedPath = config.inMemory
    ? ':memory:'
    : config.dbPath ||
      path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'relay.db');

  if (!config.inMemory) {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseConstructor(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
