import fs from 'node:fs';
import path from 'node:path';
import { getDbPath, getDataDir } from '../db/connection.js';

export function backupDatabase(): { filePath: string; fileName: string } {
  const dbPath = getDbPath();
  const backupsDir = path.join(getDataDir(), 'backups');

  fs.mkdirSync(backupsDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `organization_radar_${dateStr}.sqlite`;
  const destPath = path.join(backupsDir, fileName);

  fs.copyFileSync(dbPath, destPath);

  return { filePath: destPath, fileName };
}

export function listBackups(): { name: string; size: number; createdAt: string }[] {
  const backupsDir = path.join(getDataDir(), 'backups');
  if (!fs.existsSync(backupsDir)) return [];

  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const stat = fs.statSync(path.join(backupsDir, f));
      return {
        name: f,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return files;
}
