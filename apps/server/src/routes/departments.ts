import { Router } from 'express';
import { getDepartmentHealth, getDepartmentsHealth } from '../services/analyticsService.js';
import { getDepartmentGroupById, getDepartmentTree } from '../services/departmentGroupService.js';

const router = Router();

router.get('/departments/health', (req, res) => {
  const windowDays = Math.min(90, Math.max(1, parseInt(String(req.query.window || '30'), 10) || 30));
  res.json({ departments: getDepartmentsHealth(windowDays), windowDays });
});

router.get('/departments', (_req, res) => {
  res.json(getDepartmentTree());
});

router.get('/departments/:deptId/health', (req, res) => {
  const windowDays = Math.min(90, Math.max(1, parseInt(String(req.query.window || '30'), 10) || 30));
  const health = getDepartmentHealth(req.params.deptId, windowDays);
  if (!health) {
    res.status(404).json({ error: '部门不存在' });
    return;
  }
  res.json({ ...health, windowDays });
});

router.get('/departments/:deptId', (req, res) => {
  const { deptId } = req.params;

  const dept = getDepartmentGroupById(deptId);
  if (!dept) {
    res.status(404).json({ error: '部门不存在' });
    return;
  }

  res.json({
    deptId: dept.deptId,
    deptName: dept.deptName,
    parentDeptId: dept.parentDeptId,
    deptPath: dept.deptPath,
    memberCount: dept.memberCount,
  });
});

export default router;
