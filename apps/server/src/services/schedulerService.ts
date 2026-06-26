import { getDb } from '../db/connection.js';
import { isSyncRunning, runSync, SyncAlreadyRunningError } from './syncService.js';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const syncedMinutes = new Set<string>();

export function startScheduler(): void {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(() => {
    checkAndSync();
  }, 60_000);

  console.log('[scheduler] 自动同步调度器已启动');
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[scheduler] 自动同步调度器已停止');
  }
}

export function restartScheduler(): void {
  stopScheduler();
  syncedMinutes.clear();
  startScheduler();
}

async function checkAndSync(): Promise<void> {
  try {
    const config = readSchedulerConfig();
    if (!config.enabled || isSyncRunning()) return;

    const now = new Date();
    if (config.mode === 'interval') {
      await checkIntervalSync(config, now);
      return;
    }

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const minuteKey = `${currentTime}_${now.toDateString()}`;
    if (syncedMinutes.has(minuteKey)) return;

    const shouldSync = config.times.includes(currentTime);

    if (shouldSync) {
      syncedMinutes.add(minuteKey);
      console.log(`[scheduler] 触发定时同步: ${currentTime}`);
      await runSchedulerSync();
      console.log(`[scheduler] 定时同步完成: ${currentTime}`);
    }
  } catch (err) {
    console.error('[scheduler] 自动同步失败:', err);
  }
}

async function checkIntervalSync(config: SchedulerConfig, now: Date): Promise<void> {
  const db = getDb();
  const lastSuccessfulSync = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'last_sync_at'"
  ).get() as { value: string } | undefined;

  const lastSyncTime = lastSuccessfulSync?.value ? Date.parse(lastSuccessfulSync.value) : 0;
  const elapsedMs = now.getTime() - lastSyncTime;
  const intervalMs = Math.max(10, config.intervalMinutes) * 60_000;

  if (lastSyncTime > 0 && elapsedMs < intervalMs) return;

  console.log(`[scheduler] 触发轮询同步: 每 ${config.intervalMinutes} 分钟`);
  await runSchedulerSync();
  const finishedAt = new Date().toISOString();
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('last_poll_sync_at', ?, ?)"
  ).run(finishedAt, finishedAt);
  console.log('[scheduler] 轮询同步完成');
}

async function runSchedulerSync(): Promise<void> {
  try {
    await runSync();
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      console.log('[scheduler] 已有同步任务正在运行，本次自动同步跳过');
      return;
    }
    throw err;
  }
}

export function getSchedulerStatus(): SchedulerStatus {
  const config = readSchedulerConfig();
  return {
    enabled: config.enabled,
    mode: config.mode,
    times: config.times,
    intervalMinutes: config.intervalMinutes,
    time1: config.times[0] || '',
    time2: config.times[1] || '',
  };
}

function readSchedulerConfig(): SchedulerConfig {
  const db = getDb();

  const enabled = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_enabled'"
  ).get() as { value: string } | undefined;

  const time1 = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_time_1'"
  ).get() as { value: string } | undefined;

  const time2 = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_time_2'"
  ).get() as { value: string } | undefined;

  const mode = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_mode'"
  ).get() as { value: string } | undefined;

  const timesJson = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_times_json'"
  ).get() as { value: string } | undefined;

  const interval = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'sync_interval_minutes'"
  ).get() as { value: string } | undefined;

  return {
    enabled: enabled?.value === 'true',
    mode: mode?.value === 'interval' ? 'interval' : 'schedule',
    times: normalizeSyncTimes(timesJson?.value || '', time1?.value || '', time2?.value || ''),
    intervalMinutes: Math.max(10, parseSyncInterval(interval?.value || '60')),
  };
}

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
  return Math.floor(parsed);
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

interface SchedulerConfig {
  enabled: boolean;
  mode: 'schedule' | 'interval';
  times: string[];
  intervalMinutes: number;
}

interface SchedulerStatus extends SchedulerConfig {
  time1: string;
  time2: string;
}
