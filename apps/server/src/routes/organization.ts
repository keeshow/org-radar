import { Router } from 'express';
import { getAlerts, getOrganizationHealth, getOrganizationReport } from '../services/analyticsService.js';

const router = Router();

router.get('/organization/health', (_req, res) => {
  res.json(getOrganizationHealth(30));
});

router.get('/alerts', (req, res) => {
  const windowDays = Math.min(90, Math.max(1, parseInt(String(req.query.window || '30'), 10) || 30));
  res.json({ alerts: getAlerts(windowDays), windowDays });
});

router.get('/reports/organization', (req, res) => {
  const period = String(req.query.period || '30d');
  const normalized = period === '7d' || period === 'month' ? period : '30d';
  res.json(getOrganizationReport(normalized));
});

export default router;
