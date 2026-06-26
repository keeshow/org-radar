import { Router } from 'express';
import fs from 'node:fs';
import { getDbPath, getDb } from '../db/connection.js';
import { backupDatabase, listBackups } from '../services/backupService.js';

const router = Router();

router.get('/system/status', (_req, res) => {
  const dbPath = getDbPath();
  const dbExists = fs.existsSync(dbPath);

  const db = getDb();
  const lastSync = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'last_sync_at'"
  ).get() as { value: string } | undefined;

  const trackingStarted = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'tracking_started_at'"
  ).get() as { value: string } | undefined;

  const totalPersons = db.prepare(
    "SELECT COUNT(*) as count FROM persons WHERE status = 'present'"
  ).get() as { count: number };

  const totalSnapshots = db.prepare(
    'SELECT COUNT(*) as count FROM snapshots'
  ).get() as { count: number };

  const dbSize = dbExists ? fs.statSync(dbPath).size : 0;

  res.json({
    dbPath,
    dbExists,
    dbSizeBytes: dbSize,
    lastSyncAt: lastSync?.value || null,
    trackingStartedAt: trackingStarted?.value || null,
    totalPersons: totalPersons.count,
    totalSnapshots: totalSnapshots.count,
    dwsAvailable: true,
  });
});

router.post('/backup', (_req, res) => {
  try {
    const result = backupDatabase();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: '备份失败', message: String(err) });
  }
});

router.get('/backups', (_req, res) => {
  res.json(listBackups());
});

export default router;
