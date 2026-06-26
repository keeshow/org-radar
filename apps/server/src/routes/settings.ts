import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { getSchedulerStatus, restartScheduler } from '../services/schedulerService.js';

const router = Router();

router.get('/settings', (_req, res) => {
  const db = getDb();

  const keys = [
    'sync_enabled',
    'sync_mode',
    'sync_times_json',
    'sync_time_1',
    'sync_time_2',
    'sync_interval_minutes',
    'theme',
  ];
  const settings: Record<string, string> = {};

  for (const key of keys) {
    const row = db.prepare(
      'SELECT value FROM app_meta WHERE key = ?'
    ).get(key) as { value: string } | undefined;
    settings[key] = row?.value || '';
  }

  const syncTimes = sortTimes(normalizeSyncTimes(settings.sync_times_json, settings.sync_time_1, settings.sync_time_2));
  const syncMode = settings.sync_mode === 'interval' ? 'interval' : 'schedule';
  const interval = parseSyncInterval(settings.sync_interval_minutes || '60');

  res.json({
    syncEnabled: settings.sync_enabled === 'true',
    syncMode,
    syncTimes,
    syncIntervalMinutes: interval,
    syncTime1: syncTimes[0] || '',
    syncTime2: syncTimes[1] || '',
    theme: settings.theme || 'light',
  });
});

router.put('/settings', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const { syncEnabled, syncMode, syncTimes, syncTime1, syncTime2, syncIntervalMinutes, theme } = req.body || {};

  const upsert = db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)"
  );

  let syncChanged = false;

  if (typeof syncEnabled === 'boolean') {
    upsert.run('sync_enabled', String(syncEnabled), now);
    syncChanged = true;
  }
  if (typeof syncMode === 'string') {
    if (!['schedule', 'interval'].includes(syncMode)) {
      res.status(400).json({ error: '同步方式无效' });
      return;
    }
    upsert.run('sync_mode', syncMode, now);
    syncChanged = true;
  }
  if (Array.isArray(syncTimes) || typeof syncTime1 === 'string' || typeof syncTime2 === 'string') {
    const validation = validateSyncTimes(Array.isArray(syncTimes) ? syncTimes : [syncTime1, syncTime2]);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }
    const nextTimes = sortTimes(validation.times);
    upsert.run('sync_times_json', JSON.stringify(nextTimes), now);
    upsert.run('sync_time_1', nextTimes[0] || '', now);
    upsert.run('sync_time_2', nextTimes[1] || '', now);
    syncChanged = true;
  }
  if (syncIntervalMinutes !== undefined) {
    const interval = parseSyncInterval(syncIntervalMinutes);
    if (interval < 10) {
      res.status(400).json({ error: '轮询同步间隔不能低于 10 分钟' });
      return;
    }
    upsert.run('sync_interval_minutes', String(interval), now);
    syncChanged = true;
  }
  if (typeof theme === 'string' && ['light', 'dark'].includes(theme)) {
    upsert.run('theme', theme, now);
  }

  if (syncChanged) {
    restartScheduler();
  }

  const status = getSchedulerStatus();
  res.json({ success: true, ...status });
});

function normalizeSyncTimes(json: unknown, legacyTime1 = '', legacyTime2 = ''): string[] {
  const raw: unknown[] = [];

  if (typeof json === 'string' && json.trim()) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) raw.push(...parsed);
    } catch {
      raw.push(json);
    }
  }

  raw.push(legacyTime1, legacyTime2);

  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const time = item.trim();
    if (!isValidTime(time) || result.includes(time)) continue;
    result.push(time);
    if (result.length >= 5) break;
  }
  return result;
}

function parseSyncInterval(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || '60'), 10);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(0, Math.floor(parsed));
}

function validateSyncTimes(raw: unknown[]): { ok: true; times: string[] } | { ok: false; error: string } {
  const times = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  if (times.length > 5) {
    return { ok: false, error: '定时同步最多只能设置 5 个时间' };
  }

  for (const time of times) {
    if (!isValidTime(time)) {
      return { ok: false, error: '同步时间格式无效' };
    }
  }

  if (new Set(times).size !== times.length) {
    return { ok: false, error: '定时同步时间不能重复' };
  }

  return { ok: true, times };
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function sortTimes(times: string[]): string[] {
  return [...times].sort((a, b) => a.localeCompare(b));
}

export default router;
