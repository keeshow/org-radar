import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection.js';
import {
  fetchAllDepartments,
  collectAllDeptMembers,
  batchGetUserDetails,
  buildDeptPathMap,
  type DeptInfo,
} from './dwsService.js';
import { getBusinessDepartmentCountFromTree } from './departmentGroupService.js';
import { maybeRunSnapshotRetention } from './snapshotRetentionService.js';
import { getPublicAppConfig } from './appConfigService.js';

const nowISO = () => new Date().toISOString();
const SYNC_STAGE_TOTAL = 5;

let syncRunning = false;

export class SyncAlreadyRunningError extends Error {
  constructor() {
    super('已有同步任务正在运行');
    this.name = 'SyncAlreadyRunningError';
  }
}

export function isSyncRunning(): boolean {
  return syncRunning;
}

export function markInterruptedSyncRuns(): void {
  const db = getDb();
  const now = nowISO();
  db.prepare(`
    UPDATE sync_runs
    SET finished_at = ?, status = 'failed', error_message = ?
    WHERE status = 'running'
  `).run(now, '服务重启，同步任务被中断');
}

export async function runSync(reportProgress?: SyncProgressReporter): Promise<SyncResult> {
  if (syncRunning) {
    throw new SyncAlreadyRunningError();
  }

  syncRunning = true;
  const db = getDb();
  const syncRunId = uuidv4();
  const startedAt = nowISO();

  const report = (stageIndex: number, stage: string, message: string) => {
    reportProgress?.({
      syncRunId,
      stageIndex,
      stageTotal: SYNC_STAGE_TOTAL,
      stage,
      message,
      updatedAt: nowISO(),
    });
  };

  db.prepare(
    `INSERT INTO sync_runs (id, started_at, status) VALUES (?, ?, 'running')`
  ).run(syncRunId, startedAt);

  try {
    report(1, '获取部门树', '正在读取钉钉部门结构');
    console.log('[sync] 获取部门树...');
    const allDepts = await fetchAllDepartments((message) => report(1, '获取部门树', message));
    const flatDepts = flattenDepts(allDepts);
    const businessDepartmentCount = getBusinessDepartmentCountFromTree(flatDepts);
    const deptPathMap = buildDeptPathMap(allDepts);
    report(1, '获取部门树', `已获取 ${businessDepartmentCount} 个部门分组（${flatDepts.length} 个钉钉节点）`);
    console.log(`[sync] 获取到 ${businessDepartmentCount} 个部门分组，${flatDepts.length} 个钉钉节点`);

    report(2, '收集部门成员', `正在遍历 ${flatDepts.length} 个部门`);
    console.log('[sync] 收集所有部门成员...');
    const allUserIds = await collectAllDeptMembers(
      allDepts,
      (message) => report(2, '收集部门成员', message),
    );
    report(2, '收集部门成员', `已收集 ${allUserIds.length} 个用户ID`);
    console.log(`[sync] 收集到 ${allUserIds.length} 个用户ID`);

    report(3, '获取人员详情', `正在批量获取 ${allUserIds.length} 个人员详情`);
    console.log('[sync] 批量获取人员详情...');
    const userDetails = await batchGetUserDetails(
      allUserIds,
      (message) => report(3, '获取人员详情', message),
    );
    report(3, '获取人员详情', `已获取 ${userDetails.length} 个人员详情`);
    console.log(`[sync] 获取到 ${userDetails.length} 个人员详情`);

    const snapshotId = uuidv4();
    const syncedAt = nowISO();
    const now = syncedAt;

    const trackingStartedAt = db.prepare(
      "SELECT value FROM app_meta WHERE key = 'tracking_started_at'"
    ).get() as { value: string } | undefined;

    const isFirstSync = !trackingStartedAt;

    const prevSnapshot = db.prepare(
      'SELECT id, synced_at FROM snapshots ORDER BY synced_at DESC LIMIT 1'
    ).get() as { id: string; synced_at: string } | undefined;

    const prevSnapshotPersons = new Map<string, PrevPersonSnapshot>();
    if (prevSnapshot) {
      const prevPersons = db.prepare(
        'SELECT * FROM snapshot_persons WHERE snapshot_id = ?'
      ).all(prevSnapshot.id) as PrevPersonSnapshot[];
      for (const p of prevPersons) {
        prevSnapshotPersons.set(p.user_id, p);
      }
    }

    const upsertPersonStmt = db.prepare(`
      INSERT INTO persons (user_id, open_dingtalk_id, name, nick, title, employee_no,
        corp_name, corp_id, email, mobile, is_admin, has_subordinate,
        manager_user_id, manager_name, labels_json, status, first_seen_at,
        last_seen_at, last_sync_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'present', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name, nick = excluded.nick, title = excluded.title,
        employee_no = excluded.employee_no, corp_name = excluded.corp_name,
        corp_id = excluded.corp_id, email = excluded.email, mobile = excluded.mobile,
        is_admin = excluded.is_admin, has_subordinate = excluded.has_subordinate,
        manager_user_id = excluded.manager_user_id, manager_name = excluded.manager_name,
        labels_json = excluded.labels_json, status = 'present',
        last_seen_at = excluded.last_seen_at, last_sync_at = excluded.last_sync_at,
        updated_at = excluded.updated_at
    `);

    const upsertPersonDeptStmt = db.prepare(`
      INSERT INTO person_departments (user_id, dept_id, dept_name, dept_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, dept_id) DO UPDATE SET
        dept_name = excluded.dept_name, dept_path = excluded.dept_path, updated_at = excluded.updated_at
    `);

    const delPersonDeptsStmt = db.prepare(
      'DELETE FROM person_departments WHERE user_id = ?'
    );

    const insertSnapshotPersonStmt = db.prepare(`
      INSERT INTO snapshot_persons (snapshot_id, user_id, open_dingtalk_id, name, nick,
        title, employee_no, email, mobile, is_admin, has_subordinate,
        manager_user_id, manager_name, departments_json, profile_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSnapshotDeptStmt = db.prepare(`
      INSERT INTO snapshot_departments (snapshot_id, dept_id, dept_name,
        parent_dept_id, dept_path, member_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const upsertDeptStmt = db.prepare(`
      INSERT INTO departments (dept_id, dept_name, parent_dept_id, dept_path,
        member_count, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(dept_id) DO UPDATE SET
        dept_name = excluded.dept_name, dept_path = excluded.dept_path,
        member_count = excluded.member_count, updated_at = excluded.updated_at
    `);

    const insertChangeStmt = db.prepare(`
      INSERT INTO change_events (id, type, user_id, person_name, occurred_at,
        detected_at, from_departments_json, to_departments_json, from_title,
        to_title, changed_fields_json, description, sync_run_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let addedCount = 0;
    let removedCount = 0;
    let deptChangedCount = 0;
    let titleChangedCount = 0;
    let profileUpdatedCount = 0;

    const allCurrentUserIds = new Set<string>();

    report(4, '写入数据库', '正在保存快照并计算人员变化');
    const saveAll = db.transaction(() => {
      for (const d of flatDepts) {
        upsertDeptStmt.run(d.deptId, d.deptName, d.parentDeptId, d.deptPath, d.memberCount, now, now);
        insertSnapshotDeptStmt.run(snapshotId, d.deptId, d.deptName, d.parentDeptId, d.deptPath, d.memberCount, now);
      }

      for (const user of userDetails) {
        const emp = (user.orgEmployeeModel || user.employeeModel || user) as Record<string, unknown>;
        const uid = (emp.orgUserId || user.orgUserId || user.userId || user.user_id) as string;
        if (!uid) continue;

        const depts = (emp.depts || user.depts || []) as Array<{
          deptId?: string | number;
          dept_id?: string | number;
          deptName?: string;
          dept_name?: string;
        }>;

        const deptList = depts.map((d) => {
          const rawId = d.deptId || d.dept_id;
          const did = rawId ? String(parseInt(String(rawId), 10)) : '';
          return {
            deptId: did,
            deptName: d.deptName || d.dept_name || '',
            deptPath: deptPathMap.get(did) || d.deptName || d.dept_name || '',
          };
        }).filter((d) => d.deptId !== '1' && deptPathMap.has(d.deptId));

        if (deptList.length === 0) continue;

        allCurrentUserIds.add(uid);

        const sortedDepts = [...deptList].sort((a, b) => a.deptId.localeCompare(b.deptId));

        const profileFields = {
          name: (emp.orgUserName || user.orgUserName || user.name || user.userName || '') as string,
          nick: (user.nick || '') as string,
          title: (emp.orgTitle || user.title || emp.title || '') as string,
          email: (emp.orgAuthEmail || user.email || '') as string,
          mobile: (user.mobile || '') as string,
          managerUserId: (emp.orgMasterUserId || user.managerUserId || '') as string,
          managerName: (emp.orgMasterDisplayName || user.managerName || '') as string,
        };

        const profileHash = crypto
          .createHash('md5')
          .update(JSON.stringify(profileFields))
          .digest('hex');

        const departmentsJson = JSON.stringify(sortedDepts);
        const labelsJson = JSON.stringify(emp.labels || user.labels || []);

        if (isFirstSync) {
          upsertPersonStmt.run(
            uid,
            user.openDingTalkId || null,
            profileFields.name,
            profileFields.nick || null,
            profileFields.title || null,
            emp.jobNumber || user.employeeNo || null,
            emp.orgName || user.corpName || null,
            emp.orgId || user.corpId || null,
            profileFields.email || null,
            profileFields.mobile || null,
            user.isAdmin ? 1 : 0,
            emp.hasSubordinate ? 1 : 0,
            profileFields.managerUserId || null,
            profileFields.managerName || null,
            labelsJson,
            now,
            now,
            now,
            now,
            now,
          );
        } else {
          upsertPersonStmt.run(
            uid,
            user.openDingTalkId || null,
            profileFields.name,
            profileFields.nick || null,
            profileFields.title || null,
            emp.jobNumber || user.employeeNo || null,
            emp.orgName || user.corpName || null,
            emp.orgId || user.corpId || null,
            profileFields.email || null,
            profileFields.mobile || null,
            user.isAdmin ? 1 : 0,
            emp.hasSubordinate ? 1 : 0,
            profileFields.managerUserId || null,
            profileFields.managerName || null,
            labelsJson,
            now,
            now,
            now,
            now,
            now,
          );
        }

        delPersonDeptsStmt.run(uid);
        for (const d of deptList) {
          if (d.deptId) {
            upsertPersonDeptStmt.run(uid, d.deptId, d.deptName, d.deptPath, now, now);
          }
        }

        insertSnapshotPersonStmt.run(
          snapshotId, uid, user.openDingTalkId || null,
          profileFields.name, profileFields.nick || null,
          profileFields.title || null,
          emp.jobNumber || user.employeeNo || null,
          null, null,
          user.isAdmin ? 1 : 0, emp.hasSubordinate ? 1 : 0,
          profileFields.managerUserId || null,
          profileFields.managerName || null,
          departmentsJson, profileHash, now,
        );
      }

      if (!isFirstSync && prevSnapshotPersons.size > 0) {
        for (const [uid, prev] of prevSnapshotPersons) {
          if (!allCurrentUserIds.has(uid)) {
            removedCount++;
            const prevDepts = safeParseJson(prev.departments_json, []) as DeptItem[];
            const deptNames = prevDepts.map((d) => d.deptPath).join(', ');
            insertChangeStmt.run(
              uuidv4(), 'person_removed', uid, prev.name,
              syncedAt, syncedAt,
              prev.departments_json, null, null, null, null,
              `${prev.name} 已从通讯录中移除，移除前部门为 ${deptNames}`,
              syncRunId, now,
            );
          }
        }

        for (const uid of allCurrentUserIds) {
          if (!prevSnapshotPersons.has(uid)) {
            addedCount++;
            const snapPerson = db.prepare(
              'SELECT * FROM snapshot_persons WHERE snapshot_id = ? AND user_id = ?'
            ).get(snapshotId, uid) as PrevPersonSnapshot;

            if (snapPerson) {
              const curDepts = safeParseJson(snapPerson.departments_json, []) as DeptItem[];
              const deptNames = curDepts.map((d) => d.deptPath).join(', ');
              insertChangeStmt.run(
                uuidv4(), 'person_added', uid, snapPerson.name,
                syncedAt, syncedAt,
                null, snapPerson.departments_json, null, null, null,
                `${snapPerson.name} 出现在通讯录中，当前部门为 ${deptNames}`,
                syncRunId, now,
              );
            }
          } else {
            const prev = prevSnapshotPersons.get(uid)!;
            const cur = db.prepare(
              'SELECT * FROM snapshot_persons WHERE snapshot_id = ? AND user_id = ?'
            ).get(snapshotId, uid) as PrevPersonSnapshot | undefined;

            if (!cur) continue;

            const prevDepts = safeParseJson(prev.departments_json, []) as DeptItem[];
            const curDepts = safeParseJson(cur.departments_json, []) as DeptItem[];
            const prevSorted = [...prevDepts].sort((a, b) => a.deptId.localeCompare(b.deptId));
            const curSorted = [...curDepts].sort((a, b) => a.deptId.localeCompare(b.deptId));
            const prevDeptIds = prevSorted.map((d) => d.deptId).join(',');
            const curDeptIds = curSorted.map((d) => d.deptId).join(',');

            if (prevDeptIds !== curDeptIds) {
              deptChangedCount++;
              const fromPath = prevSorted.map((d) => d.deptPath).join(', ');
              const toPath = curSorted.map((d) => d.deptPath).join(', ');
              insertChangeStmt.run(
                uuidv4(), 'department_changed', uid, cur.name,
                syncedAt, syncedAt,
                prev.departments_json, cur.departments_json, null, null, null,
                `${cur.name} 从 ${fromPath} 调整到 ${toPath}`,
                syncRunId, now,
              );
            }

            if (prev.title !== cur.title && cur.title) {
              titleChangedCount++;
              insertChangeStmt.run(
                uuidv4(), 'title_changed', uid, cur.name,
                syncedAt, syncedAt,
                null, null, prev.title || '', cur.title,
                JSON.stringify({ title: { from: prev.title, to: cur.title } }),
                `${cur.name} 职位从 ${prev.title || '无'} 变更为 ${cur.title}`,
                syncRunId, now,
              );
            }

            if (prev.profile_hash !== cur.profile_hash) {
              profileUpdatedCount++;
              insertChangeStmt.run(
                uuidv4(), 'profile_updated', uid, cur.name,
                syncedAt, syncedAt,
                null, null, null, null,
                null,
                `${cur.name} 的基础信息发生更新`,
                syncRunId, now,
              );
            }
          }
        }
      }

      if (isFirstSync) {
        db.prepare(
          "INSERT INTO app_meta (key, value, updated_at) VALUES ('tracking_started_at', ?, ?) ON CONFLICT(key) DO NOTHING"
        ).run(syncedAt, now);
      }

      db.prepare(
        "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('last_sync_at', ?, ?)"
      ).run(syncedAt, now);

      db.prepare(
        "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('schema_version', '1', ?)"
      ).run(now);

      db.prepare(
        "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('app_title', ?, ?)"
      ).run(getPublicAppConfig().appName, now);

      db.prepare(
        `INSERT INTO sync_runs (id, started_at, finished_at, status, total_departments,
          total_persons, added_count, removed_count, department_changed_count,
          title_changed_count, profile_updated_count)
         VALUES (?, ?, ?, 'success', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          finished_at = excluded.finished_at, status = excluded.status,
          total_departments = excluded.total_departments,
          total_persons = excluded.total_persons,
          added_count = excluded.added_count,
          removed_count = excluded.removed_count,
          department_changed_count = excluded.department_changed_count,
          title_changed_count = excluded.title_changed_count,
          profile_updated_count = excluded.profile_updated_count`
      ).run(
        syncRunId, startedAt, syncedAt, businessDepartmentCount,
        allCurrentUserIds.size, addedCount, removedCount,
        deptChangedCount, titleChangedCount, profileUpdatedCount,
      );

      const hasChanges = addedCount + removedCount + deptChangedCount + titleChangedCount + profileUpdatedCount > 0;
      const isDailyCheckpoint = !prevSnapshot || localDayKey(prevSnapshot.synced_at) !== localDayKey(syncedAt);
      const keepSnapshot = isFirstSync || hasChanges || isDailyCheckpoint;

      if (keepSnapshot) {
        db.prepare(
          `INSERT INTO snapshots (id, sync_run_id, synced_at, total_person_count, total_department_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(snapshotId, syncRunId, syncedAt, allCurrentUserIds.size, businessDepartmentCount, now);
      } else {
        db.prepare('DELETE FROM snapshot_persons WHERE snapshot_id = ?').run(snapshotId);
        db.prepare('DELETE FROM snapshot_departments WHERE snapshot_id = ?').run(snapshotId);
      }

      for (const uid of prevSnapshotPersons.keys()) {
        if (!allCurrentUserIds.has(uid)) {
          db.prepare(
            "UPDATE persons SET status = 'removed', updated_at = ? WHERE user_id = ?"
          ).run(now, uid);
        }
      }
    });

    saveAll();
    const retention = maybeRunSnapshotRetention();
    if (retention.ran && retention.deletedSnapshots > 0) {
      console.log(`[snapshot] 已清理 ${retention.deletedSnapshots} 张历史快照，保留 ${retention.keptSnapshots} 张`);
    }
    report(5, '同步完成', `已同步 ${businessDepartmentCount} 个部门分组、${allCurrentUserIds.size} 个人员`);

    return {
      syncRunId,
      status: 'success',
      totalDepartments: businessDepartmentCount,
      totalPersons: allCurrentUserIds.size,
      addedCount,
      removedCount,
      departmentChangedCount: deptChangedCount,
      titleChangedCount,
      profileUpdatedCount,
      isFirstSync,
    };
  } catch (err) {
    console.error('[sync] 同步失败:', err);
    db.prepare(
      "UPDATE sync_runs SET finished_at = ?, status = 'failed', error_message = ? WHERE id = ?"
    ).run(nowISO(), String(err), syncRunId);
    throw err;
  } finally {
    syncRunning = false;
  }
}

function localDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function flattenDepts(depts: DeptInfo[]): DeptInfo[] {
  const result: DeptInfo[] = [];
  const stack = [...depts];
  while (stack.length > 0) {
    const d = stack.shift()!;
    result.push(d);
    if (d.children) {
      stack.unshift(...d.children);
    }
  }
  return result;
}

function safeParseJson(str: string | undefined, fallback: unknown): unknown {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

interface DeptItem {
  deptId: string;
  deptName: string;
  deptPath: string;
}

interface PrevPersonSnapshot {
  user_id: string;
  name: string;
  title: string;
  departments_json: string;
  profile_hash: string;
}

export interface SyncResult {
  syncRunId: string;
  status: string;
  totalDepartments: number;
  totalPersons: number;
  addedCount: number;
  removedCount: number;
  departmentChangedCount: number;
  titleChangedCount: number;
  profileUpdatedCount: number;
  isFirstSync: boolean;
}

export interface SyncProgress {
  syncRunId: string;
  stageIndex: number;
  stageTotal: number;
  stage: string;
  message: string;
  updatedAt: string;
}

export type SyncProgressReporter = (progress: SyncProgress) => void;
