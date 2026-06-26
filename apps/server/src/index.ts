import './config/env.js';
import express from 'express';
import cors from 'cors';
import { initDb, closeDb } from './db/connection.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';
import overviewRoutes from './routes/overview.js';
import contactRoutes from './routes/contacts.js';
import departmentRoutes from './routes/departments.js';
import changeRoutes from './routes/changes.js';
import syncRoutes from './routes/sync.js';
import systemRoutes from './routes/system.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import publicConfigRoutes from './routes/publicConfig.js';
import organizationRoutes from './routes/organization.js';
import { requireAuth } from './services/authService.js';
import { markInterruptedSyncRuns } from './services/syncService.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

initDb();
markInterruptedSyncRuns();
console.log('[server] 数据库初始化完成');
startScheduler();

app.use('/api', authRoutes);
app.use('/api', publicConfigRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', requireAuth);
app.use('/api', overviewRoutes);
app.use('/api', contactRoutes);
app.use('/api', departmentRoutes);
app.use('/api', changeRoutes);
app.use('/api', organizationRoutes);
app.use('/api', syncRoutes);
app.use('/api', systemRoutes);
app.use('/api', settingsRoutes);

app.listen(PORT, () => {
  console.log(`[server] 服务已启动: http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  stopScheduler();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  closeDb();
  process.exit(0);
});
