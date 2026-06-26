import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { getBusinessDepartmentCount, getDepartmentGroups } from '../services/departmentGroupService.js';

const router = Router();

router.get('/overview', (_req, res) => {
  const db = getDb();

  const totalPersons = db.prepare(
    "SELECT COUNT(*) as count FROM persons WHERE status = 'present'"
  ).get() as { count: number };

  const lastSync = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'last_sync_at'"
  ).get() as { value: string } | undefined;

  const trackingStarted = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'tracking_started_at'"
  ).get() as { value: string } | undefined;

  const totalAdded = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_added'"
  ).get() as { count: number };

  const totalRemoved = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_removed'"
  ).get() as { count: number };

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentAdded = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_added' AND detected_at >= ?"
  ).get(oneDayAgo) as { count: number };

  const recentRemoved = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_removed' AND detected_at >= ?"
  ).get(oneDayAgo) as { count: number };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthAdded = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_added' AND detected_at >= ?"
  ).get(thirtyDaysAgo) as { count: number };
  const monthRemoved = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'person_removed' AND detected_at >= ?"
  ).get(thirtyDaysAgo) as { count: number };

  const recentChanges = db.prepare(
    `SELECT * FROM change_events ORDER BY detected_at DESC LIMIT 10`
  ).all() as ChangeEvent[];

  const totalDepartments = getBusinessDepartmentCount();

  const deptChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'department_changed'"
  ).get() as { count: number };
  const titleChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'title_changed'"
  ).get() as { count: number };

  const recentDeptChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'department_changed' AND detected_at >= ?"
  ).get(oneDayAgo) as { count: number };
  const recentTitleChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'title_changed' AND detected_at >= ?"
  ).get(oneDayAgo) as { count: number };

  const totalDeptChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'department_changed'"
  ).get() as { count: number };
  const totalTitleChanged = db.prepare(
    "SELECT COUNT(*) as count FROM change_events WHERE type = 'title_changed'"
  ).get() as { count: number };

  const deptOverview = getDepartmentGroups()
    .sort((a, b) => b.memberCount - a.memberCount || a.deptPath.localeCompare(b.deptPath, 'zh-Hans-CN'));

  res.json({
    totalPersons: totalPersons.count,
    totalDepartments,
    totalAdded: totalAdded.count,
    totalRemoved: totalRemoved.count,
    netChange: totalAdded.count - totalRemoved.count,
    recentAdded: recentAdded.count,
    recentRemoved: recentRemoved.count,
    recentNetChange: recentAdded.count - recentRemoved.count,
    recentDeptChanged: recentDeptChanged.count,
    recentTitleChanged: recentTitleChanged.count,
    monthAdded: monthAdded.count,
    monthRemoved: monthRemoved.count,
    monthNetChange: monthAdded.count - monthRemoved.count,
    totalDeptChanged: totalDeptChanged.count,
    totalTitleChanged: totalTitleChanged.count,
    lastSyncAt: lastSync?.value || null,
    trackingStartedAt: trackingStarted?.value || null,
    recentChanges: recentChanges.map(formatChangeEvent),
    deptOverview: deptOverview.map((d) => ({
      deptId: d.deptId,
      deptName: d.deptName,
      deptPath: d.deptPath,
      personCount: d.memberCount,
    })),
  });
});

interface ChangeEvent {
  id: string;
  type: string;
  user_id: string;
  person_name: string;
  description: string;
  detected_at: string;
  from_departments_json?: string;
  to_departments_json?: string;
  from_title?: string;
  to_title?: string;
  changed_fields_json?: string;
}

function formatChangeEvent(e: ChangeEvent) {
  return {
    id: e.id,
    type: e.type,
    userId: e.user_id,
    personName: e.person_name,
    description: e.description,
    detectedAt: e.detected_at,
    fromDepartments: e.from_departments_json ? JSON.parse(e.from_departments_json) : null,
    toDepartments: e.to_departments_json ? JSON.parse(e.to_departments_json) : null,
    fromTitle: e.from_title,
    toTitle: e.to_title,
    changedFields: e.changed_fields_json ? JSON.parse(e.changed_fields_json) : null,
  };
}

export default router;
