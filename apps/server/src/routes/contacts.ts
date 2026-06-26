import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { enrichPersonByName } from '../services/dwsService.js';
import { getDescendantDepartmentIds, toSqlPlaceholders } from '../services/departmentGroupService.js';

const router = Router();

function maskPhone(phone?: string) {
  if (!phone) return '';
  return phone.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2');
}

function maskEmail(email?: string) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

function formatPerson(row: Record<string, unknown>) {
  const labels = cleanLabels(safeParse(row.labels_json as string, []));
  const personDepts = getDb().prepare(
    'SELECT dept_id, dept_name, dept_path FROM person_departments WHERE user_id = ?'
  ).all(row.user_id) as { dept_id: string; dept_name: string; dept_path: string }[];

  return {
    userId: row.user_id,
    openDingtalkId: row.open_dingtalk_id,
    name: row.name,
    nick: row.nick,
    title: row.title,
    employeeNo: row.employee_no,
    corpName: row.corp_name,
    email: row.email,
    emailMasked: maskEmail(row.email as string),
    mobile: row.mobile,
    mobileMasked: maskPhone(row.mobile as string),
    isAdmin: !!row.is_admin,
    hasSubordinate: !!row.has_subordinate,
    managerUserId: row.manager_user_id,
    managerName: row.manager_name,
    labels,
    departments: personDepts.map((d) => ({
      deptId: d.dept_id,
      deptName: d.dept_name,
      deptPath: d.dept_path,
    })),
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastSyncAt: row.last_sync_at,
  };
}

function safeParse(str: string, fallback: unknown): unknown {
  try { return JSON.parse(str); } catch { return fallback; }
}

function cleanLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      if (typeof l === 'string') return l;
      if (l && typeof l === 'object') return (l as Record<string, unknown>).name as string || '';
      return '';
    })
    .filter(Boolean);
}

router.get('/contacts', (req, res) => {
  const db = getDb();
  const { search, deptId, status, scope } = req.query as Record<string, string>;

  let sql = 'SELECT * FROM persons WHERE 1=1';
  const params: string[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  } else {
    sql += " AND status = 'present'";
  }

  if (search) {
    sql += ' AND (name LIKE ? OR title LIKE ? OR employee_no LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (deptId) {
    if (scope === 'direct') {
      const ids = getDirectDepartmentUserIds(deptId);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        sql += ` AND user_id IN (${placeholders})`;
        params.push(...ids);
      } else {
        sql += ' AND 1=0';
      }
    } else {
      const deptIds = getDescendantDepartmentIds(deptId);
      if (deptIds.length === 0) {
        sql += ' AND 1=0';
      } else {
        const deptPlaceholders = toSqlPlaceholders(deptIds);
        const deptUserIds = db.prepare(
          `SELECT DISTINCT user_id FROM person_departments WHERE dept_id IN (${deptPlaceholders})`
        ).all(...deptIds) as { user_id: string }[];
        const ids = deptUserIds.map((d) => d.user_id);
        if (ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          sql += ` AND user_id IN (${placeholders})`;
          params.push(...ids);
        } else {
          sql += ' AND 1=0';
        }
      }
    }
  }

  sql += ' ORDER BY name ASC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const result = rows.map(formatPerson);
  res.json(result);
});

function getDirectDepartmentUserIds(deptId: string): string[] {
  const db = getDb();
  const descendantIds = getDescendantDepartmentIds(deptId);
  const childIds = descendantIds.filter((id) => id !== deptId);

  const directRows = db.prepare(
    'SELECT DISTINCT user_id FROM person_departments WHERE dept_id = ?'
  ).all(deptId) as { user_id: string }[];
  const directUserIds = directRows.map((row) => row.user_id);

  if (directUserIds.length === 0) return [];
  if (childIds.length === 0) return directUserIds;

  const childDeptPlaceholders = toSqlPlaceholders(childIds);
  const directUserPlaceholders = toSqlPlaceholders(directUserIds);
  const childRows = db.prepare(`
    SELECT DISTINCT user_id
    FROM person_departments
    WHERE dept_id IN (${childDeptPlaceholders})
      AND user_id IN (${directUserPlaceholders})
  `).all(...childIds, ...directUserIds) as { user_id: string }[];

  const childUserIds = new Set(childRows.map((row) => row.user_id));
  const pureDirectUserIds = directUserIds.filter((userId) => !childUserIds.has(userId));

  return pureDirectUserIds;
}

router.get('/contacts/:userId', async (req, res) => {
  const db = getDb();
  const { userId } = req.params;

  const row = db.prepare('SELECT * FROM persons WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  const person = row ? formatPerson(row) : formatHistoricalPerson(userId);
  if (!person) {
    res.status(404).json({ error: '人员不存在' });
    return;
  }

  if (person.status === 'present') {
    const enrichment = await enrichPersonByName(person.name as string);
    if (enrichment) {
      if (enrichment.openDingTalkId) {
        person.openDingtalkId = enrichment.openDingTalkId;
      }
      if (enrichment.email) {
        person.email = enrichment.email;
        person.emailMasked = maskEmail(enrichment.email);
      }
      if (enrichment.mobile) {
        person.mobile = enrichment.mobile;
        person.mobileMasked = maskPhone(enrichment.mobile);
      }
    }
  }
  const changes = db.prepare(
    'SELECT * FROM change_events WHERE user_id = ? ORDER BY detected_at DESC'
  ).all(userId);

  const personalChanges = (changes as Record<string, unknown>[]).map((e) => ({
    id: e.id,
    type: e.type,
    description: e.description,
    detectedAt: e.detected_at,
    fromDepartments: e.from_departments_json ? JSON.parse(e.from_departments_json as string) : null,
    toDepartments: e.to_departments_json ? JSON.parse(e.to_departments_json as string) : null,
    fromTitle: e.from_title,
    toTitle: e.to_title,
  }));

  res.json({ ...person, changes: personalChanges });
});

function formatHistoricalPerson(userId: string) {
  const db = getDb();
  const snapshot = db.prepare(`
    SELECT sp.*, s.synced_at
    FROM snapshot_persons sp
    JOIN snapshots s ON s.id = sp.snapshot_id
    WHERE sp.user_id = ?
    ORDER BY s.synced_at DESC
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;

  const range = db.prepare(`
    SELECT MIN(s.synced_at) first_seen_at, MAX(s.synced_at) last_seen_at
    FROM snapshot_persons sp
    JOIN snapshots s ON s.id = sp.snapshot_id
    WHERE sp.user_id = ?
  `).get(userId) as { first_seen_at: string | null; last_seen_at: string | null };

  if (snapshot) {
    const departments = safeParse(snapshot.departments_json as string, []);
    return {
      userId,
      openDingtalkId: snapshot.open_dingtalk_id || '',
      name: snapshot.name,
      nick: snapshot.nick || '',
      title: snapshot.title || '',
      employeeNo: snapshot.employee_no || '',
      corpName: '',
      email: snapshot.email || '',
      emailMasked: maskEmail(snapshot.email as string),
      mobile: snapshot.mobile || '',
      mobileMasked: maskPhone(snapshot.mobile as string),
      isAdmin: !!snapshot.is_admin,
      hasSubordinate: !!snapshot.has_subordinate,
      managerUserId: snapshot.manager_user_id || '',
      managerName: snapshot.manager_name || '',
      labels: [],
      departments: Array.isArray(departments) ? departments : [],
      status: 'removed',
      firstSeenAt: range.first_seen_at || snapshot.synced_at,
      lastSeenAt: range.last_seen_at || snapshot.synced_at,
      lastSyncAt: range.last_seen_at || snapshot.synced_at,
    };
  }

  const change = db.prepare(`
    SELECT * FROM change_events
    WHERE user_id = ?
    ORDER BY detected_at DESC
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;
  if (!change) return null;

  const departments = safeParse(
    (change.to_departments_json || change.from_departments_json) as string,
    [],
  );
  return {
    userId,
    openDingtalkId: '',
    name: change.person_name,
    nick: '',
    title: change.to_title || change.from_title || '',
    employeeNo: '',
    corpName: '',
    email: '',
    emailMasked: '',
    mobile: '',
    mobileMasked: '',
    isAdmin: false,
    hasSubordinate: false,
    managerUserId: '',
    managerName: '',
    labels: [],
    departments: Array.isArray(departments) ? departments : [],
    status: 'removed',
    firstSeenAt: change.detected_at,
    lastSeenAt: change.detected_at,
    lastSyncAt: change.detected_at,
  };
}

export default router;
