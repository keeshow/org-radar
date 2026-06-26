import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const dataDir = process.env.ORG_RADAR_DATA_DIR || process.env.EBYTE_PEOPLE_MAP_DATA_DIR || path.join(projectRoot, 'data');
const dbPath = process.env.ORG_RADAR_DB_PATH || process.env.EBYTE_PEOPLE_MAP_DB_PATH || path.join(dataDir, 'organization_radar.sqlite');

let db: Database.Database;

export function getDbPath(): string {
  return dbPath;
}

export function getDataDir(): string {
  return dataDir;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'exports'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
