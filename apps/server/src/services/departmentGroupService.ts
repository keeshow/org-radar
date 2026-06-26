import { getDb } from '../db/connection.js';

export interface DepartmentGroup {
  deptId: string;
  deptName: string;
  parentDeptId: string | null;
  deptPath: string;
  memberCount: number;
}

export interface DepartmentTreeNode extends DepartmentGroup {
  children: DepartmentTreeNode[];
}

interface DepartmentRow {
  dept_id: string;
  dept_name: string;
  parent_dept_id: string | null;
  dept_path: string;
  member_count: number;
}

interface DepartmentIndex {
  rows: DepartmentRow[];
  byId: Map<string, DepartmentRow>;
  roots: DepartmentRow[];
  groupByDeptId: Map<string, string>;
  descendantsByGroupId: Map<string, string[]>;
}

export function getBusinessDepartmentCount(): number {
  return buildDepartmentIndex().roots.length;
}

export function getBusinessDepartmentCountFromTree<T extends { parentDeptId: string | null }>(depts: T[]): number {
  return depts.filter((dept) => dept.parentDeptId === null).length;
}

export function getDepartmentGroups(): DepartmentGroup[] {
  const counts = getDepartmentGroupMemberCounts();
  return buildDepartmentIndex().roots.map((row) => formatGroup(row, counts.get(row.dept_id) || 0));
}

export function getDepartmentTree(): DepartmentTreeNode[] {
  const index = buildDepartmentIndex();
  const countSets = getAggregatedDepartmentMemberSets(index);

  const nodes = new Map<string, DepartmentTreeNode>();
  for (const row of index.rows) {
    nodes.set(row.dept_id, {
      deptId: row.dept_id,
      deptName: row.dept_name,
      parentDeptId: row.parent_dept_id,
      deptPath: row.dept_path,
      memberCount: countSets.get(row.dept_id)?.size || 0,
      children: [],
    });
  }

  const roots: DepartmentTreeNode[] = [];
  for (const row of index.rows) {
    const node = nodes.get(row.dept_id);
    if (!node) continue;

    if (row.parent_dept_id && nodes.has(row.parent_dept_id)) {
      nodes.get(row.parent_dept_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

export function getDepartmentGroupById(deptId: string): DepartmentGroup | null {
  const index = buildDepartmentIndex();
  const groupId = index.groupByDeptId.get(deptId);
  if (!groupId) return null;

  const row = index.byId.get(groupId);
  if (!row) return null;

  const count = getDepartmentGroupMemberCounts().get(groupId) || 0;
  return formatGroup(row, count);
}

export function getDepartmentGroupIdForDeptId(deptId: string | null | undefined): string | null {
  if (!deptId) return null;
  return buildDepartmentIndex().groupByDeptId.get(deptId) || null;
}

export function getDepartmentGroupIdMap(): Map<string, string> {
  return new Map(buildDepartmentIndex().groupByDeptId);
}

export function getDescendantDepartmentIds(groupId: string): string[] {
  return buildDepartmentIndex().descendantsByGroupId.get(groupId) || [];
}

export function getDepartmentGroupMemberCounts(): Map<string, number> {
  const db = getDb();
  const index = buildDepartmentIndex();
  const usersByGroup = new Map<string, Set<string>>();

  for (const root of index.roots) {
    usersByGroup.set(root.dept_id, new Set());
  }

  const rows = db.prepare(`
    SELECT pd.user_id, pd.dept_id
    FROM person_departments pd
    JOIN persons p ON p.user_id = pd.user_id
    WHERE p.status = 'present'
  `).all() as { user_id: string; dept_id: string }[];

  for (const row of rows) {
    const groupId = index.groupByDeptId.get(row.dept_id);
    if (!groupId) continue;
    const users = usersByGroup.get(groupId);
    if (users) users.add(row.user_id);
  }

  return new Map([...usersByGroup.entries()].map(([groupId, users]) => [groupId, users.size]));
}

export function getGroupIdsForDepartmentItems(items: Array<{ deptId?: string | null }>): Set<string> {
  const groupIds = new Set<string>();
  const index = buildDepartmentIndex();

  for (const item of items) {
    if (!item.deptId) continue;
    const groupId = index.groupByDeptId.get(item.deptId);
    if (groupId) groupIds.add(groupId);
  }

  return groupIds;
}

export function toSqlPlaceholders(values: unknown[]): string {
  return values.map(() => '?').join(',');
}

function getAggregatedDepartmentMemberSets(index: DepartmentIndex): Map<string, Set<string>> {
  const db = getDb();
  const usersByDept = new Map<string, Set<string>>();
  const childIdsByDept = new Map<string, string[]>();

  for (const row of index.rows) {
    usersByDept.set(row.dept_id, new Set());
    if (row.parent_dept_id) {
      const childIds = childIdsByDept.get(row.parent_dept_id) || [];
      childIds.push(row.dept_id);
      childIdsByDept.set(row.parent_dept_id, childIds);
    }
  }

  const rows = db.prepare(`
    SELECT pd.user_id, pd.dept_id
    FROM person_departments pd
    JOIN persons p ON p.user_id = pd.user_id
    WHERE p.status = 'present'
  `).all() as { user_id: string; dept_id: string }[];

  for (const row of rows) {
    const deptUsers = usersByDept.get(row.dept_id);
    if (deptUsers) deptUsers.add(row.user_id);
  }

  const result = new Map<string, Set<string>>();
  for (const row of index.rows) {
    const descendants = collectDescendantIds(row.dept_id, childIdsByDept);
    const users = new Set<string>();
    for (const deptId of descendants) {
      const deptUsers = usersByDept.get(deptId);
      if (!deptUsers) continue;
      for (const userId of deptUsers) users.add(userId);
    }
    result.set(row.dept_id, users);
  }

  return result;
}

function collectDescendantIds(deptId: string, childIdsByDept: Map<string, string[]>): string[] {
  const result: string[] = [];
  const stack = [deptId];
  while (stack.length > 0) {
    const id = stack.shift()!;
    result.push(id);
    stack.unshift(...(childIdsByDept.get(id) || []));
  }
  return result;
}

function buildDepartmentIndex(): DepartmentIndex {
  const db = getDb();
  const rows = db.prepare(`
    SELECT dept_id, dept_name, parent_dept_id, dept_path, member_count
    FROM departments
    ORDER BY dept_path ASC
  `).all() as DepartmentRow[];

  const byId = new Map(rows.map((row) => [row.dept_id, row]));
  const roots = sortGroups(rows.filter((row) => row.parent_dept_id === null));
  const groupByDeptId = new Map<string, string>();
  const descendantsByGroupId = new Map<string, string[]>();
  const childIdsByDept = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.parent_dept_id) continue;
    const childIds = childIdsByDept.get(row.parent_dept_id) || [];
    childIds.push(row.dept_id);
    childIdsByDept.set(row.parent_dept_id, childIds);
  }

  for (const row of rows) {
    const groupId = findRootId(row.dept_id, byId);
    if (!groupId) continue;

    groupByDeptId.set(row.dept_id, groupId);
    descendantsByGroupId.set(row.dept_id, collectDescendantIds(row.dept_id, childIdsByDept));
  }

  return { rows, byId, roots, groupByDeptId, descendantsByGroupId };
}

function findRootId(deptId: string, byId: Map<string, DepartmentRow>): string | null {
  let current = byId.get(deptId);
  const seen = new Set<string>();

  while (current) {
    if (seen.has(current.dept_id)) return null;
    seen.add(current.dept_id);

    if (!current.parent_dept_id) return current.dept_id;
    current = byId.get(current.parent_dept_id);
  }

  return null;
}

function sortGroups(rows: DepartmentRow[]): DepartmentRow[] {
  return [...rows].sort((a, b) => {
    if (a.dept_id === '1') return 1;
    if (b.dept_id === '1') return -1;
    return a.dept_path.localeCompare(b.dept_path, 'zh-Hans-CN');
  });
}

function sortTree(nodes: DepartmentTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.deptId === '1') return 1;
    if (b.deptId === '1') return -1;
    return a.deptPath.localeCompare(b.deptPath, 'zh-Hans-CN');
  });

  for (const node of nodes) {
    sortTree(node.children);
  }
}

function formatGroup(row: DepartmentRow, memberCount: number): DepartmentGroup {
  return {
    deptId: row.dept_id,
    deptName: row.dept_name,
    parentDeptId: row.parent_dept_id,
    deptPath: row.dept_path,
    memberCount,
  };
}
