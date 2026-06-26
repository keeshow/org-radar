import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { getDescendantDepartmentIds } from '../services/departmentGroupService.js';

const router = Router();

router.get('/changes', (req, res) => {
  const db = getDb();
  const { type, deptId, startDate, endDate, search, page = '1', limit = '50' } = req.query as Record<string, string>;

  let sql = 'SELECT * FROM change_events WHERE 1=1';
  const params: string[] = [];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (startDate) {
    sql += ' AND detected_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    sql += ' AND detected_at <= ?';
    params.push(endDate);
  }

  if (search) {
    sql += ' AND person_name LIKE ?';
    params.push(`%${search}%`);
  }

  if (deptId) {
    const departmentIds = getDescendantDepartmentIds(deptId);
    if (departmentIds.length === 0) {
      sql += ' AND 1=0';
    } else {
      const conditions = departmentIds.map(() => "(from_departments_json LIKE ? OR to_departments_json LIKE ?)");
      sql += ` AND (${conditions.join(' OR ')})`;
      for (const id of departmentIds) {
        const pattern = `%\"deptId\":\"${id}\"%`;
        params.push(pattern, pattern);
      }
    }
  }

  sql += ' ORDER BY detected_at DESC';

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * pageSize;

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM (${sql})`).get(...params) as { total: number };
  const rows = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as Record<string, unknown>[];

  const changes = rows.map((e) => ({
    id: e.id,
    type: e.type,
    userId: e.user_id,
    personName: e.person_name,
    description: e.description,
    detectedAt: e.detected_at,
    fromDepartments: e.from_departments_json ? JSON.parse(e.from_departments_json as string) : null,
    toDepartments: e.to_departments_json ? JSON.parse(e.to_departments_json as string) : null,
    fromTitle: e.from_title,
    toTitle: e.to_title,
    changedFields: e.changed_fields_json ? JSON.parse(e.changed_fields_json as string) : null,
  }));

  res.json({
    changes,
    total: countResult.total,
    page: pageNum,
    limit: pageSize,
    hasMore: pageNum * pageSize < countResult.total,
  });
});

router.get('/changes/grouped', (_req, res) => {
  const db = getDb();

  const groups = db.prepare(`
    SELECT date(detected_at) as date, type, COUNT(*) as count
    FROM change_events
    GROUP BY date(detected_at), type
    ORDER BY date DESC, type
  `).all() as { date: string; type: string; count: number }[];

  const grouped: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    if (!grouped[g.date]) grouped[g.date] = {};
    grouped[g.date][g.type] = g.count;
  }

  res.json(grouped);
});

export default router;
