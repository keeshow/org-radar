import { getDb } from '../db/connection.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface SnapshotRetentionResult {
  ran: boolean;
  deletedSnapshots: number;
  keptSnapshots: number;
}

export function maybeRunSnapshotRetention(force = false): SnapshotRetentionResult {
  const db = getDb();
  const now = new Date();
  const cleanupMeta = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'last_snapshot_cleanup_at'"
  ).get() as { value: string } | undefined;

  if (!force && cleanupMeta?.value && localDayKey(cleanupMeta.value) === localDayKey(now.toISOString())) {
    return { ran: false, deletedSnapshots: 0, keptSnapshots: countSnapshots() };
  }

  const snapshots = db.prepare(`
    SELECT id, synced_at
    FROM snapshots
    ORDER BY synced_at DESC
  `).all() as { id: string; synced_at: string }[];

  const keepIds = new Set<string>();
  const keptDays = new Set<string>();
  const keptMonths = new Set<string>();

  for (const [index, snapshot] of snapshots.entries()) {
    const syncedAt = Date.parse(snapshot.synced_at);
    const ageMs = Math.max(0, now.getTime() - syncedAt);

    if (index === 0 || ageMs <= 48 * HOUR_MS) {
      keepIds.add(snapshot.id);
      continue;
    }

    if (ageMs <= 30 * DAY_MS) {
      const day = localDayKey(snapshot.synced_at);
      if (!keptDays.has(day)) {
        keptDays.add(day);
        keepIds.add(snapshot.id);
      }
      continue;
    }

    if (ageMs <= 365 * DAY_MS) {
      const month = localMonthKey(snapshot.synced_at);
      if (!keptMonths.has(month)) {
        keptMonths.add(month);
        keepIds.add(snapshot.id);
      }
    }
  }

  const deleteIds = snapshots.filter((snapshot) => !keepIds.has(snapshot.id)).map((snapshot) => snapshot.id);
  const cleanedAt = now.toISOString();

  db.transaction(() => {
    const deletePersons = db.prepare('DELETE FROM snapshot_persons WHERE snapshot_id = ?');
    const deleteDepartments = db.prepare('DELETE FROM snapshot_departments WHERE snapshot_id = ?');
    const deleteSnapshot = db.prepare('DELETE FROM snapshots WHERE id = ?');

    for (const snapshotId of deleteIds) {
      deletePersons.run(snapshotId);
      deleteDepartments.run(snapshotId);
      deleteSnapshot.run(snapshotId);
    }

    db.prepare(`
      INSERT OR REPLACE INTO app_meta (key, value, updated_at)
      VALUES ('last_snapshot_cleanup_at', ?, ?)
    `).run(cleanedAt, cleanedAt);
  })();

  db.pragma('wal_checkpoint(PASSIVE)');
  return { ran: true, deletedSnapshots: deleteIds.length, keptSnapshots: keepIds.size };
}

function countSnapshots(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) count FROM snapshots').get() as { count: number };
  return row.count;
}

function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMonthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
