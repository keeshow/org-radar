import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DWS_TIMEOUT = 120_000;
const MAX_BUFFER = 1024 * 1024 * 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDws(args: string[], retries = MAX_RETRIES): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { stdout, stderr } = await execFileAsync('dws', args, {
        timeout: DWS_TIMEOUT,
        maxBuffer: MAX_BUFFER,
      });

      if (stderr && stderr.includes('RECOVERY_EVENT_ID')) {
        const match = stderr.match(/RECOVERY_EVENT_ID=(\S+)/);
        if (match) {
          console.error(`[dws recovery] ${match[1]}`);
        }
      }

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error && parsed.error.code === 6) {
          if (attempt < retries) {
            console.log(`[dws retry ${attempt}/${retries}] ${args[0]} ${args[1]} - 网络超时，等待重试...`);
            await sleep(RETRY_DELAY_MS * attempt);
            continue;
          }
          throw new Error(`dws 网络超时 (code 6): ${parsed.error.message}`);
        }
        return parsed;
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message.startsWith('dws 网络超时')) {
          throw parseErr;
        }
        throw new Error(`dws 返回内容不是合法 JSON。stdout 前200字符: ${stdout.slice(0, 200)}`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        console.log(`[dws retry ${attempt}/${retries}] ${args[0]} ${args[1]} - ${lastError.message.slice(0, 80)}`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error('dws 调用失败');
}

export async function fetchAllDepartments(progress?: DwsProgressReporter): Promise<DeptInfo[]> {
  progress?.('正在读取根部门');
  const rootChildren = await runDws([
    'contact', 'dept', 'list-children',
    '--id', '1',
    '--format', 'json',
  ]) as { success: boolean; result?: DeptChild[] };

  if (!rootChildren.success || !rootChildren.result) {
    throw new Error('获取根部门子部门失败');
  }

  const allDepts: DeptInfo[] = [];

  let discoveredCount = 0;
  const reportDept = (deptId: string, deptName: string) => {
    discoveredCount++;
    progress?.(`正在读取部门：${deptName || deptId}（已发现 ${discoveredCount} 个）`);
  };

  for (const child of rootChildren.result) {
    const cleanId = cleanDeptId(child.deptId);
    const name = child.deptName || '';
    const dept = await buildDeptTree(cleanId, name, null, null, reportDept);
    allDepts.push(dept);
  }
  return allDepts;
}

async function buildDeptTree(
  deptId: string,
  deptName: string,
  parentDeptId: string | null,
  parentPath: string | null,
  progress?: (deptId: string, deptName: string) => void
): Promise<DeptInfo> {
  progress?.(deptId, deptName);
  const currentPath = parentPath ? `${parentPath} / ${deptName}` : deptName;

  const dept: DeptInfo = {
    deptId,
    deptName,
    parentDeptId,
    deptPath: currentPath,
    memberCount: 0,
    children: [],
  };

  try {
    const children = await runDws([
      'contact', 'dept', 'list-children',
      '--id', deptId,
      '--format', 'json',
    ]) as { success: boolean; result?: DeptChild[] };

    if (children.success && children.result && children.result.length > 0) {
      for (const child of children.result) {
        const childId = cleanDeptId(child.deptId);
        const childName = child.deptName || '';
        const childDept = await buildDeptTree(childId, childName, deptId, currentPath, progress);
        dept.children.push(childDept);
      }
    }
  } catch (err) {
    console.log(`[dws] 获取子部门失败 dept=${deptId}: ${String(err).slice(0, 80)}`);
  }

  try {
    const members = await runDws([
      'contact', 'dept', 'list-members',
      '--ids', deptId,
      '--format', 'json',
    ], 2) as { success: boolean; deptUserList?: { userInfo?: { userId?: string } }[] };

    if (members.success && members.deptUserList) {
      dept.memberCount = members.deptUserList.length;
    }
  } catch (err) {
    console.log(`[dws] 获取部门成员数失败 dept=${deptId}: ${String(err).slice(0, 80)}`);
  }

  return dept;
}

export async function fetchDeptMembers(deptId: string): Promise<string[]> {
  try {
    const result = await runDws([
      'contact', 'dept', 'list-members',
      '--ids', deptId,
      '--format', 'json',
    ], 2) as { success: boolean; deptUserList?: { userInfo?: { userId?: string } }[] };

    if (!result.success || !result.deptUserList) {
      return [];
    }

    const userIds = result.deptUserList
      .map((m) => m.userInfo?.userId)
      .filter(Boolean) as string[];
    return userIds;
  } catch (err) {
    console.log(`[dws] 获取部门成员失败 dept=${deptId}: ${String(err).slice(0, 80)}`);
    return [];
  }
}

export async function batchGetUserDetails(userIds: string[], progress?: DwsProgressReporter): Promise<Record<string, unknown>[]> {
  if (userIds.length === 0) return [];

  const batchSize = 50;
  const allResults: Record<string, unknown>[] = [];

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    progress?.(`正在获取人员详情：${Math.min(i + batch.length, userIds.length)}/${userIds.length}`);
    try {
      const result = await runDws([
        'contact', 'user', 'get',
        '--ids', batch.join(','),
        '--format', 'json',
      ]) as { success: boolean; result?: Record<string, unknown>[] };

      if (result.success && result.result) {
        allResults.push(...result.result);
      }
    } catch (err) {
      console.log(`[dws] 批量获取用户详情失败 (batch ${i}-${i + batch.length}): ${String(err).slice(0, 80)}`);
    }
  }

  return allResults;
}

export async function collectAllDeptMembers(depts: DeptInfo[], progress?: DwsProgressReporter): Promise<string[]> {
  const allUserIds = new Set<string>();
  const deptQueue = [...depts];
  const totalDepts = flattenDepts(depts).length;
  let processedDepts = 0;

  while (deptQueue.length > 0) {
    const dept = deptQueue.shift()!;
    if (dept.children) {
      deptQueue.push(...dept.children);
    }

    const members = await fetchDeptMembers(dept.deptId);
    for (const uid of members) {
      allUserIds.add(uid);
    }
    processedDepts++;
    progress?.(`正在读取成员：${dept.deptName}（${processedDepts}/${totalDepts}，累计 ${allUserIds.size} 人）`);
  }

  return Array.from(allUserIds);
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

export function buildDeptPathMap(depts: DeptInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of flattenDepts(depts)) {
    map.set(d.deptId, d.deptPath);
  }
  return map;
}

export interface DeptInfo {
  deptId: string;
  deptName: string;
  parentDeptId: string | null;
  deptPath: string;
  memberCount: number;
  children: DeptInfo[];
}

interface DeptChild {
  deptId?: string | number;
  deptName?: string;
}

type DwsProgressReporter = (message: string) => void;

function cleanDeptId(id: string | number | undefined): string {
  if (id === undefined || id === null) return '';
  return String(parseInt(String(id), 10));
}

export interface AisearchEnrichment {
  openDingTalkId?: string;
  email?: string;
  mobile?: string;
  officeLocation?: string;
}

export async function enrichPersonByName(name: string): Promise<AisearchEnrichment | null> {
  try {
    const result = await runDws([
      'aisearch', 'person',
      '--keyword', name,
      '--dimension', 'name',
      '--format', 'json',
    ]) as { success: boolean; result?: AisearchResult[] };

    if (!result.success || !result.result || result.result.length === 0) {
      return null;
    }

    const hit = result.result[0];
    if (hit.title !== name) return null;

    const enrichment: AisearchEnrichment = {};

    if (hit.openDingTalkId) {
      enrichment.openDingTalkId = hit.openDingTalkId;
    }

    if (hit.meta?.ext) {
      try {
        const ext = JSON.parse(hit.meta.ext);
        if (ext['邮箱']) enrichment.email = ext['邮箱'];
        if (ext['手机号']) enrichment.mobile = ext['手机号'];
        if (ext['办公地点']) enrichment.officeLocation = ext['办公地点'];
      } catch { /* ignore parse errors */ }
    }

    return enrichment;
  } catch {
    return null;
  }
}

interface AisearchResult {
  title?: string;
  openDingTalkId?: string;
  userId?: string;
  meta?: {
    ext?: string;
  };
}
