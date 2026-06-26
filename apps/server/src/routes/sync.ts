import { Router } from 'express';
import {
  isSyncRunning,
  runSync,
  SyncAlreadyRunningError,
  type SyncResult,
  type SyncProgress,
} from '../services/syncService.js';
import { getDb } from '../db/connection.js';

const router = Router();

interface SyncStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  syncRunId: string | null;
  stageIndex: number;
  stageTotal: number;
  stage: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  errorMessage: string | null;
  result: SyncResult | null;
}

let currentSyncStatus: SyncStatus = {
  status: 'idle',
  syncRunId: null,
  stageIndex: 0,
  stageTotal: 5,
  stage: '空闲',
  message: '暂无同步任务',
  startedAt: null,
  finishedAt: null,
  updatedAt: null,
  errorMessage: null,
  result: null,
};

function applyProgress(progress: SyncProgress) {
  currentSyncStatus = {
    ...currentSyncStatus,
    status: 'running',
    syncRunId: progress.syncRunId,
    stageIndex: progress.stageIndex,
    stageTotal: progress.stageTotal,
    stage: progress.stage,
    message: progress.message,
    updatedAt: progress.updatedAt,
  };
}

router.post('/sync', async (_req, res) => {
  if (currentSyncStatus.status === 'running' || isSyncRunning()) {
    if (currentSyncStatus.status !== 'running') {
      currentSyncStatus = {
        status: 'running',
        syncRunId: null,
        stageIndex: 0,
        stageTotal: 5,
        stage: '同步中',
        message: '已有同步任务正在运行',
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date().toISOString(),
        errorMessage: null,
        result: null,
      };
    }
    res.json(currentSyncStatus);
    return;
  }

  const startedAt = new Date().toISOString();
  currentSyncStatus = {
    status: 'running',
    syncRunId: null,
    stageIndex: 0,
    stageTotal: 5,
    stage: '准备同步',
    message: '正在创建同步任务',
    startedAt,
    finishedAt: null,
    updatedAt: startedAt,
    errorMessage: null,
    result: null,
  };

  runSync(applyProgress)
    .then((result) => {
      const finishedAt = new Date().toISOString();
      currentSyncStatus = {
        ...currentSyncStatus,
        status: 'success',
        syncRunId: result.syncRunId,
        stageIndex: 5,
        stageTotal: 5,
        stage: '同步完成',
        message: `已同步 ${result.totalDepartments} 个部门分组、${result.totalPersons} 个人员`,
        finishedAt,
        updatedAt: finishedAt,
        errorMessage: null,
        result,
      };
    })
    .catch((err) => {
      if (err instanceof SyncAlreadyRunningError) {
        currentSyncStatus = {
          ...currentSyncStatus,
          status: 'running',
          message: err.message,
          updatedAt: new Date().toISOString(),
          errorMessage: null,
        };
        return;
      }

      const finishedAt = new Date().toISOString();
      currentSyncStatus = {
        ...currentSyncStatus,
        status: 'failed',
        finishedAt,
        updatedAt: finishedAt,
        errorMessage: String(err),
        message: '同步失败',
      };
    });

  res.status(202).json(currentSyncStatus);
});

router.get('/sync/status', (_req, res) => {
  res.json(currentSyncStatus);
});

router.get('/sync/logs', (req, res) => {
  const db = getDb();
  const { page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * pageSize;

  const total = db.prepare('SELECT COUNT(*) as count FROM sync_runs').get() as { count: number };
  const logs = db.prepare(
    'SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ? OFFSET ?'
  ).all(pageSize, offset);

  res.json({
    logs,
    total: total.count,
    page: pageNum,
    limit: pageSize,
  });
});

export default router;
