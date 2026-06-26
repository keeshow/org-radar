import { getDb } from '../db/connection.js';
import {
  getBusinessDepartmentCount,
  getDepartmentGroupById,
  getDepartmentGroupIdMap,
  getDepartmentGroups,
} from './departmentGroupService.js';

type AlertLevel = 'info' | 'warning' | 'critical';
type HealthLevel = 'stable' | 'attention' | 'volatile' | 'risk';
type DeptHealthTag = '稳定' | '扩张' | '流失关注' | '频繁调整' | '数据不足';
type Period = '7d' | '30d' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeptItem {
  deptId: string;
  deptName: string;
  deptPath: string;
}

export interface FormattedChange {
  id: string;
  type: string;
  userId: string;
  personName: string;
  description: string;
  detectedAt: string;
  fromDepartments: DeptItem[] | null;
  toDepartments: DeptItem[] | null;
  fromTitle: string | null;
  toTitle: string | null;
  changedFields: Record<string, unknown> | null;
}

interface ChangeRow {
  id: string;
  type: string;
  user_id: string;
  person_name: string;
  description: string;
  detected_at: string;
  from_departments_json?: string | null;
  to_departments_json?: string | null;
  from_title?: string | null;
  to_title?: string | null;
  changed_fields_json?: string | null;
}

interface DeptRow {
  dept_id: string;
  dept_name: string;
  dept_path: string;
  person_count: number;
}

interface DeptMetrics {
  deptId: string;
  deptName: string;
  deptPath: string;
  currentPersons: number;
  addedCount: number;
  removedCount: number;
  netChange: number;
  departmentChangedCount: number;
  titleChangedCount: number;
  tag: DeptHealthTag;
  riskScore: number;
}

interface ScoreDeduction {
  key: string;
  label: string;
  value: number;
}

export interface DeptHealth extends DeptMetrics {
  recentChanges: FormattedChange[];
}

export interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  reason: string;
  deptId: string | null;
  deptName: string | null;
  personName: string | null;
  detectedAt: string;
}

export function getOrganizationHealth(windowDays = 30) {
  const db = getDb();
  const since = daysAgo(windowDays);

  const totalPersons = scalar("SELECT COUNT(*) FROM persons WHERE status = 'present'");
  const totalDepartments = getBusinessDepartmentCount();
  const added = countChanges('person_added', since);
  const removed = countChanges('person_removed', since);
  const deptChanged = countChanges('department_changed', since);
  const titleChanged = countChanges('title_changed', since);
  const alerts = getAlerts(windowDays);
  const criticalAlerts = alerts.filter((a) => a.level === 'critical').length;
  const netChange = added - removed;
  const departmentMetrics = buildDeptMetrics(since);
  const keyPersonImpact = getKeyPersonImpact(since);
  const departureImpact = getDepartureImpact(removed, totalPersons);
  const netDecreaseImpact = getNetDecreaseImpact(Math.max(0, -netChange), totalPersons);
  const concentratedDept = getMostConcentratedDepartment(departmentMetrics);
  const departmentConcentrationImpact = concentratedDept?.impact || 0;
  const organizationAdjustmentImpact = getOrganizationAdjustmentImpact(deptChanged + titleChanged, totalPersons);

  const score = clamp(
    100
      - departureImpact
      - netDecreaseImpact
      - departmentConcentrationImpact
      - organizationAdjustmentImpact
      - keyPersonImpact.impact,
    0,
    100,
  );

  const level: HealthLevel = score >= 90
    ? 'stable'
    : score >= 75
      ? 'attention'
      : score >= 60
        ? 'volatile'
        : 'risk';

  const deductions: ScoreDeduction[] = [
    { key: 'departure', label: '人员流失影响', value: departureImpact },
    { key: 'netDecrease', label: '净减少影响', value: netDecreaseImpact },
    { key: 'departmentConcentration', label: '部门集中影响', value: departmentConcentrationImpact },
    { key: 'organizationAdjustment', label: '组织调整影响', value: organizationAdjustmentImpact },
    { key: 'keyPerson', label: '关键人员影响', value: keyPersonImpact.impact },
  ];

  const removedRateText = formatRate(removed, totalPersons);
  const netDecrease = Math.max(0, -netChange);

  const reasons = [
    removed > 0 ? `近 ${windowDays} 天离职 ${removed} 人，整体离职率 ${removedRateText}` : '',
    concentratedDept ? `${concentratedDept.deptName}出现 ${concentratedDept.removedCount} 人离职，存在局部流失` : '',
    netDecrease > 0 ? `近 ${windowDays} 天净减少 ${netDecrease} 人，入职已用于抵消净减少影响` : '',
    deptChanged + titleChanged > 0 ? `部门和职位调整共 ${deptChanged + titleChanged} 次` : '',
    keyPersonImpact.reason,
  ].filter(Boolean);

  const trend = getOrganizationEventTrend(totalPersons, totalDepartments);

  const recentChanges = db.prepare(`
    SELECT * FROM change_events
    ORDER BY detected_at DESC
    LIMIT 8
  `).all() as ChangeRow[];

  return {
    level,
    score,
    reasons,
    updatedAt: new Date().toISOString(),
    windowDays,
    metrics: {
      totalPersons,
      totalDepartments,
      added,
      removed,
      netChange,
      departmentChanged: deptChanged,
      titleChanged,
      alertCount: alerts.length,
      criticalAlertCount: criticalAlerts,
      removedRate: rate(removed, totalPersons),
      netDecreaseRate: rate(netDecrease, totalPersons),
      organizationAdjustmentRate: rate(deptChanged + titleChanged, totalPersons),
      deductions,
    },
    trend,
    alerts: alerts.slice(0, 5),
    recentChanges: recentChanges.map(formatChangeEvent),
  };
}

export function getDepartmentsHealth(windowDays = 30): DeptHealth[] {
  const since = daysAgo(windowDays);
  return buildDeptMetrics(since)
    .map((dept) => ({
      ...dept,
      recentChanges: getDeptRecentChanges(dept.deptId, since, 5),
    }))
    .sort((a, b) => b.riskScore - a.riskScore || b.removedCount - a.removedCount || a.deptPath.localeCompare(b.deptPath));
}

export function getDepartmentHealth(deptId: string, windowDays = 30) {
  const dept = getDepartmentGroupById(deptId);

  if (!dept) return null;

  const since = daysAgo(windowDays);
  const groupIdMap = getDepartmentGroupIdMap();
  const metrics = buildMetricsForDept({
    dept_id: dept.deptId,
    dept_name: dept.deptName,
    dept_path: dept.deptPath,
    person_count: dept.memberCount,
  }, getChangesSince(since), groupIdMap);
  const trend = getDepartmentEventTrend(dept.deptId, dept.memberCount);

  return {
    ...metrics,
    trend,
    recentChanges: getDeptRecentChanges(dept.deptId, since, 20),
  };
}

export function getAlerts(windowDays = 30): Alert[] {
  const since = daysAgo(windowDays);
  const alerts: Alert[] = [];

  for (const dept of buildDeptMetrics(since)) {
    if (dept.removedCount >= 2) {
      alerts.push({
        id: `dept_removed_${dept.deptId}`,
        level: 'critical',
        title: '部门流失关注',
        reason: `${dept.deptName} 近 ${windowDays} 天离职 ${dept.removedCount} 人`,
        deptId: dept.deptId,
        deptName: dept.deptName,
        personName: null,
        detectedAt: new Date().toISOString(),
      });
    }
    if (dept.netChange <= -2) {
      alerts.push({
        id: `dept_net_${dept.deptId}`,
        level: 'warning',
        title: '部门净减少',
        reason: `${dept.deptName} 近 ${windowDays} 天净减少 ${Math.abs(dept.netChange)} 人`,
        deptId: dept.deptId,
        deptName: dept.deptName,
        personName: null,
        detectedAt: new Date().toISOString(),
      });
    }
    if (dept.departmentChangedCount >= 3) {
      alerts.push({
        id: `dept_changes_${dept.deptId}`,
        level: 'warning',
        title: '组织调整频繁',
        reason: `${dept.deptName} 近 ${windowDays} 天发生 ${dept.departmentChangedCount} 次部门变动`,
        deptId: dept.deptId,
        deptName: dept.deptName,
        personName: null,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  const db = getDb();
  const removedRows = db.prepare(`
    SELECT * FROM change_events
    WHERE type = 'person_removed' AND detected_at >= ?
    ORDER BY detected_at DESC
    LIMIT 20
  `).all(since) as ChangeRow[];

  for (const row of removedRows) {
    const depts = parseDeptList(row.from_departments_json);
    const dept = firstGroupFromDeptItems(depts);
    alerts.push({
      id: `person_removed_${row.id}`,
      level: 'info',
      title: '人员离职',
      reason: `${row.person_name} 已从通讯录中移除`,
      deptId: dept?.deptId || null,
      deptName: dept?.deptName || null,
      personName: row.person_name,
      detectedAt: row.detected_at,
    });
  }

  const keyRows = db.prepare(`
    SELECT ce.*, p.is_admin, p.has_subordinate
    FROM change_events ce
    LEFT JOIN persons p ON p.user_id = ce.user_id
    WHERE ce.detected_at >= ?
      AND ce.type IN ('person_removed', 'department_changed', 'title_changed')
      AND (p.is_admin = 1 OR p.has_subordinate = 1)
    ORDER BY ce.detected_at DESC
    LIMIT 20
  `).all(since) as (ChangeRow & { is_admin?: number; has_subordinate?: number })[];

  for (const row of keyRows) {
    const depts = parseDeptList(row.to_departments_json || row.from_departments_json);
    const dept = firstGroupFromDeptItems(depts);
    alerts.push({
      id: `key_person_${row.id}`,
      level: 'warning',
      title: '关键人员变化',
      reason: `${row.person_name} 发生${changeTypeText(row.type)}`,
      deptId: dept?.deptId || null,
      deptName: dept?.deptName || null,
      personName: row.person_name,
      detectedAt: row.detected_at,
    });
  }

  return dedupeAlerts(alerts).sort((a, b) => levelWeight(b.level) - levelWeight(a.level) || b.detectedAt.localeCompare(a.detectedAt));
}

export function getOrganizationReport(period: Period) {
  const { label, since } = getPeriodRange(period);
  const windowDays = getPeriodWindowDays(period, since);
  const db = getDb();
  const currentPersons = scalar("SELECT COUNT(*) FROM persons WHERE status = 'present'");
  const currentDepartments = getBusinessDepartmentCount();
  const changes = getChangesSince(since);
  const added = changes.filter((c) => c.type === 'person_added');
  const removed = changes.filter((c) => c.type === 'person_removed');
  const departmentChanged = changes.filter((c) => c.type === 'department_changed');
  const titleChanged = changes.filter((c) => c.type === 'title_changed');
  const deptHealth = getDepartmentsHealth(windowDays);
  const alerts = getAlerts(windowDays);
  const latestSync = db.prepare("SELECT value FROM app_meta WHERE key = 'last_sync_at'").get() as { value: string } | undefined;

  return {
    period,
    label,
    generatedAt: new Date().toISOString(),
    latestSyncAt: latestSync?.value || null,
    summary: {
      currentPersons,
      currentDepartments,
      added: added.length,
      removed: removed.length,
      netChange: added.length - removed.length,
      departmentChanged: departmentChanged.length,
      titleChanged: titleChanged.length,
      alertCount: alerts.length,
    },
    addedPersons: added.map(formatChangeEvent),
    removedPersons: removed.map(formatChangeEvent),
    departmentChanges: departmentChanged.map(formatChangeEvent),
    titleChanges: titleChanged.map(formatChangeEvent),
    volatileDepartments: getDepartmentObservations(deptHealth).slice(0, 8),
    alerts: alerts.slice(0, 10),
  };
}

function getDepartmentObservations(departments: DeptHealth[]): DeptHealth[] {
  return departments
    .filter((dept) => dept.removedCount > 0 || dept.netChange < 0 || dept.departmentChangedCount > 0 || dept.titleChangedCount > 0 || dept.tag === '流失关注' || dept.tag === '频繁调整')
    .sort((a, b) => b.removedCount - a.removedCount || a.netChange - b.netChange || b.riskScore - a.riskScore || a.deptPath.localeCompare(b.deptPath));
}

function buildDeptMetrics(since: string): DeptMetrics[] {
  const depts = getDepartmentGroups().map((dept) => ({
    dept_id: dept.deptId,
    dept_name: dept.deptName,
    dept_path: dept.deptPath,
    person_count: dept.memberCount,
  }));

  const changes = getChangesSince(since);
  const groupIdMap = getDepartmentGroupIdMap();
  return depts.map((dept) => buildMetricsForDept(dept, changes, groupIdMap));
}

function buildMetricsForDept(dept: DeptRow, changes: ChangeRow[], groupIdMap: Map<string, string>): DeptMetrics {
  let addedCount = 0;
  let removedCount = 0;
  let departmentChangedCount = 0;
  let titleChangedCount = 0;

  for (const change of changes) {
    const fromDepts = parseDeptList(change.from_departments_json);
    const toDepts = parseDeptList(change.to_departments_json);
    const inFrom = deptItemsContainGroup(fromDepts, dept.dept_id, groupIdMap);
    const inTo = deptItemsContainGroup(toDepts, dept.dept_id, groupIdMap);

    if (change.type === 'person_added' && inTo) addedCount++;
    if (change.type === 'person_removed' && inFrom) removedCount++;
    if (change.type === 'department_changed' && (inFrom || inTo)) departmentChangedCount++;
    if (change.type === 'title_changed' && (inFrom || inTo)) titleChangedCount++;
  }

  const netChange = addedCount - removedCount;
  const departmentBase = Math.max(0, (dept.person_count || 0) + removedCount);
  const riskScore = clamp(
    getDepartmentRemovalRisk(removedCount, departmentBase)
      + getNetDecreaseImpact(Math.max(0, -netChange), Math.max(1, departmentBase))
      + getOrganizationAdjustmentImpact(departmentChangedCount + titleChangedCount, Math.max(1, departmentBase)),
    0,
    100,
  );
  const tag = getDeptTag({
    currentPersons: dept.person_count || 0,
    addedCount,
    removedCount,
    netChange,
    departmentChangedCount,
  });

  return {
    deptId: dept.dept_id,
    deptName: dept.dept_name,
    deptPath: dept.dept_path,
    currentPersons: dept.person_count || 0,
    addedCount,
    removedCount,
    netChange,
    departmentChangedCount,
    titleChangedCount,
    tag,
    riskScore,
  };
}

function getDepartureImpact(removedCount: number, totalPersons: number): number {
  const value = rate(removedCount, totalPersons);
  if (value <= 0) return 0;
  if (value <= 0.005) return 4;
  if (value <= 0.01) return 8;
  if (value <= 0.02) return 15;
  if (value <= 0.03) return 22;
  if (value <= 0.05) return 30;
  return 35;
}

function getNetDecreaseImpact(netDecrease: number, totalPersons: number): number {
  const value = rate(netDecrease, totalPersons);
  if (value <= 0) return 0;
  if (value <= 0.005) return 3;
  if (value <= 0.01) return 6;
  if (value <= 0.02) return 10;
  return 15;
}

function getDepartmentRemovalRisk(removedCount: number, departmentBase: number): number {
  if (removedCount <= 0) return 0;
  if (departmentBase < 5) return removedCount >= 2 ? 4 : 0;

  const value = removedCount / departmentBase;
  if (removedCount >= 5 || value >= 0.12) return 25;
  if (removedCount >= 3 && value >= 0.08) return 18;
  if (removedCount >= 2 && value >= 0.05) return 10;
  return 0;
}

function getMostConcentratedDepartment(departments: DeptMetrics[]) {
  return departments
    .map((dept) => {
      const departmentBase = Math.max(0, dept.currentPersons + dept.removedCount);
      return {
        deptId: dept.deptId,
        deptName: dept.deptName,
        removedCount: dept.removedCount,
        rate: rate(dept.removedCount, departmentBase),
        impact: getDepartmentRemovalRisk(dept.removedCount, departmentBase),
      };
    })
    .filter((dept) => dept.impact > 0)
    .sort((a, b) => b.impact - a.impact || b.removedCount - a.removedCount || b.rate - a.rate)[0];
}

function getOrganizationAdjustmentImpact(adjustmentCount: number, totalPersons: number): number {
  const value = rate(adjustmentCount, totalPersons);
  if (value <= 0) return 0;
  if (value <= 0.01) return 3;
  if (value <= 0.02) return 6;
  if (value <= 0.05) return 10;
  return 15;
}

function getKeyPersonImpact(since: string): { impact: number; reason: string } {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ce.type
    FROM change_events ce
    LEFT JOIN persons p ON p.user_id = ce.user_id
    WHERE ce.detected_at >= ?
      AND ce.type IN ('person_removed', 'department_changed', 'title_changed')
      AND (p.is_admin = 1 OR p.has_subordinate = 1)
  `).all(since) as { type: string }[];

  if (rows.length === 0) return { impact: 0, reason: '' };
  if (rows.some((row) => row.type === 'person_removed')) {
    return { impact: 10, reason: '出现关键人员离职' };
  }
  if (rows.some((row) => row.type === 'department_changed')) {
    return { impact: 5, reason: '出现关键人员部门变化' };
  }
  return { impact: 3, reason: '出现关键人员职位变化' };
}

function getDeptRecentChanges(deptId: string, since: string, limit: number): FormattedChange[] {
  const changes = getChangesSince(since);
  const groupIdMap = getDepartmentGroupIdMap();
  return changes
    .filter((change) => {
      const fromDepts = parseDeptList(change.from_departments_json);
      const toDepts = parseDeptList(change.to_departments_json);
      return deptItemsContainGroup(fromDepts, deptId, groupIdMap) || deptItemsContainGroup(toDepts, deptId, groupIdMap);
    })
    .slice(0, limit)
    .map(formatChangeEvent);
}

function deptItemsContainGroup(items: DeptItem[], groupId: string, groupIdMap: Map<string, string>): boolean {
  return items.some((item) => item.deptId && groupIdMap.get(item.deptId) === groupId);
}

function firstGroupFromDeptItems(items: DeptItem[]) {
  const groupIdMap = getDepartmentGroupIdMap();
  for (const item of items) {
    if (!item.deptId) continue;
    const groupId = groupIdMap.get(item.deptId);
    if (!groupId) continue;
    return getDepartmentGroupById(groupId);
  }
  return null;
}

function getOrganizationEventTrend(currentPersons: number, totalDepartments: number): Array<{ syncedAt: string; totalPersons: number; totalDepartments: number }> {
  const db = getDb();
  const snapshots = db.prepare(`
    SELECT synced_at, total_person_count
    FROM snapshots
    ORDER BY synced_at ASC
  `).all() as { synced_at: string; total_person_count: number }[];

  if (snapshots.length === 0) {
    return [{ syncedAt: new Date().toISOString(), totalPersons: currentPersons, totalDepartments }];
  }

  const firstSnapshot = snapshots[0];
  const changes = db.prepare(`
    SELECT detected_at, type
    FROM change_events
    WHERE type IN ('person_added', 'person_removed')
      AND detected_at >= ?
    ORDER BY detected_at ASC, created_at ASC
  `).all(firstSnapshot.synced_at) as { detected_at: string; type: string }[];

  if (changes.length === 0) {
    return snapshots.map((snapshot) => ({
      syncedAt: snapshot.synced_at,
      totalPersons: snapshot.total_person_count,
      totalDepartments,
    }));
  }

  let totalPersons = firstSnapshot.total_person_count;
  const trend = [{
    syncedAt: firstSnapshot.synced_at,
    totalPersons,
    totalDepartments,
  }];

  for (const change of changes) {
    totalPersons += change.type === 'person_added' ? 1 : -1;
    trend.push({
      syncedAt: change.detected_at,
      totalPersons,
      totalDepartments,
    });
  }

  if (trend[trend.length - 1]?.totalPersons !== currentPersons) {
    trend.push({
      syncedAt: new Date().toISOString(),
      totalPersons: currentPersons,
      totalDepartments,
    });
  }

  return trend;
}

function getDepartmentEventTrend(groupId: string, currentMemberCount: number): Array<{ syncedAt: string; memberCount: number }> {
  const db = getDb();
  const groupIdMap = getDepartmentGroupIdMap();
  const firstSnapshot = db.prepare(`
    SELECT id, synced_at
    FROM snapshots
    ORDER BY synced_at ASC
    LIMIT 1
  `).get() as { id: string; synced_at: string } | undefined;

  if (!firstSnapshot) {
    return [{ syncedAt: new Date().toISOString(), memberCount: currentMemberCount }];
  }

  let memberCount = getSnapshotDepartmentMemberCount(firstSnapshot.id, groupId, groupIdMap);
  const trend = [{
    syncedAt: firstSnapshot.synced_at,
    memberCount,
  }];

  const changes = db.prepare(`
    SELECT *
    FROM change_events
    WHERE type IN ('person_added', 'person_removed', 'department_changed')
      AND detected_at >= ?
    ORDER BY detected_at ASC, created_at ASC
  `).all(firstSnapshot.synced_at) as ChangeRow[];

  for (const change of changes) {
    const fromDepts = parseDeptList(change.from_departments_json);
    const toDepts = parseDeptList(change.to_departments_json);
    const inFrom = deptItemsContainGroup(fromDepts, groupId, groupIdMap);
    const inTo = deptItemsContainGroup(toDepts, groupId, groupIdMap);

    if (change.type === 'person_added' && inTo) {
      memberCount++;
    } else if (change.type === 'person_removed' && inFrom) {
      memberCount--;
    } else if (change.type === 'department_changed') {
      if (!inFrom && inTo) memberCount++;
      if (inFrom && !inTo) memberCount--;
    } else {
      continue;
    }

    trend.push({
      syncedAt: change.detected_at,
      memberCount,
    });
  }

  if (trend[trend.length - 1]?.memberCount !== currentMemberCount) {
    trend.push({
      syncedAt: new Date().toISOString(),
      memberCount: currentMemberCount,
    });
  }

  return trend;
}

function getSnapshotDepartmentMemberCount(snapshotId: string, groupId: string, groupIdMap: Map<string, string>): number {
  const db = getDb();
  const snapshotPersonsStmt = db.prepare(`
    SELECT user_id, departments_json
    FROM snapshot_persons
    WHERE snapshot_id = ?
  `);

  const userIds = new Set<string>();
  const persons = snapshotPersonsStmt.all(snapshotId) as { user_id: string; departments_json: string }[];

  for (const person of persons) {
    const depts = parseDeptList(person.departments_json);
    if (deptItemsContainGroup(depts, groupId, groupIdMap)) {
      userIds.add(person.user_id);
    }
  }

  return userIds.size;
}

function getChangesSince(since: string): ChangeRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM change_events
    WHERE detected_at >= ?
    ORDER BY detected_at DESC
  `).all(since) as ChangeRow[];
}

function countChanges(type: string, since: string): number {
  return scalar('SELECT COUNT(*) FROM change_events WHERE type = ? AND detected_at >= ?', type, since);
}

function scalar(sql: string, ...params: unknown[]): number {
  const db = getDb();
  const row = db.prepare(sql).get(...params) as Record<string, number> | undefined;
  return row ? Number(Object.values(row)[0] || 0) : 0;
}

function formatChangeEvent(e: ChangeRow): FormattedChange {
  return {
    id: e.id,
    type: e.type,
    userId: e.user_id,
    personName: e.person_name,
    description: e.description,
    detectedAt: e.detected_at,
    fromDepartments: parseDeptList(e.from_departments_json),
    toDepartments: parseDeptList(e.to_departments_json),
    fromTitle: e.from_title || null,
    toTitle: e.to_title || null,
    changedFields: safeParseJson<Record<string, unknown> | null>(e.changed_fields_json, null),
  };
}

function parseDeptList(json: string | null | undefined): DeptItem[] {
  const parsed = safeParseJson<DeptItem[]>(json, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function getDeptTag(metrics: {
  currentPersons: number;
  addedCount: number;
  removedCount: number;
  netChange: number;
  departmentChangedCount: number;
}): DeptHealthTag {
  if (metrics.currentPersons === 0 && metrics.addedCount === 0 && metrics.removedCount === 0) return '数据不足';
  const departmentBase = metrics.currentPersons + metrics.removedCount;
  if (getDepartmentRemovalRisk(metrics.removedCount, departmentBase) >= 10 || (metrics.netChange <= -2 && getNetDecreaseImpact(Math.max(0, -metrics.netChange), Math.max(1, departmentBase)) >= 10)) {
    return '流失关注';
  }
  if (getOrganizationAdjustmentImpact(metrics.departmentChangedCount, Math.max(1, departmentBase)) >= 10) return '频繁调整';
  if (metrics.netChange >= 2) return '扩张';
  return '稳定';
}

function getPeriodRange(period: Period): { label: string; since: string } {
  const now = new Date();
  if (period === '7d') {
    return { label: '最近 7 天', since: new Date(now.getTime() - 7 * DAY_MS).toISOString() };
  }
  if (period === 'month') {
    return { label: '本月', since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  }
  return { label: '最近 30 天', since: new Date(now.getTime() - 30 * DAY_MS).toISOString() };
}

function getPeriodWindowDays(period: Period, since: string): number {
  if (period === '7d') return 7;
  if (period === '30d') return 30;
  return Math.max(1, Math.round((Date.now() - Date.parse(since)) / DAY_MS));
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function rate(count: number, denominator: number): number {
  if (count <= 0 || denominator <= 0) return 0;
  return count / denominator;
}

function formatRate(count: number, denominator: number): string {
  return `${(rate(count, denominator) * 100).toFixed(1)}%`;
}

function levelWeight(level: AlertLevel): number {
  return level === 'critical' ? 3 : level === 'warning' ? 2 : 1;
}

function changeTypeText(type: string): string {
  const map: Record<string, string> = {
    person_removed: '离职',
    department_changed: '部门变动',
    title_changed: '职位变动',
  };
  return map[type] || '变化';
}

function dedupeAlerts(alerts: Alert[]): Alert[] {
  const seen = new Set<string>();
  const result: Alert[] = [];
  for (const alert of alerts) {
    if (seen.has(alert.id)) continue;
    seen.add(alert.id);
    result.push(alert);
  }
  return result;
}
