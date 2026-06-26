export interface PublicAppConfig {
  appName: string;
  orgName: string;
  accessControlEnabled: boolean;
}

export interface Person {
  userId: string;
  openDingtalkId: string;
  name: string;
  nick: string;
  title: string;
  employeeNo: string;
  corpName: string;
  email: string;
  emailMasked: string;
  mobile: string;
  mobileMasked: string;
  isAdmin: boolean;
  hasSubordinate: boolean;
  managerUserId: string;
  managerName: string;
  labels: (string | { name?: string; groupName?: string; id?: string; tagGroupCode?: string })[];
  departments: PersonDepartment[];
  status: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncAt: string;
}

export interface PersonDepartment {
  deptId: string;
  deptName: string;
  deptPath: string;
}

export interface PersonDetail extends Person {
  changes: PersonalChange[];
}

export interface PersonalChange {
  id: string;
  type: string;
  description: string;
  detectedAt: string;
  fromDepartments: PersonDepartment[] | null;
  toDepartments: PersonDepartment[] | null;
  fromTitle: string | null;
  toTitle: string | null;
}

export interface Department {
  deptId: string;
  deptName: string;
  parentDeptId: string | null;
  deptPath: string;
  memberCount: number;
  children: Department[];
}

export interface ChangeEvent {
  id: string;
  type: string;
  userId: string;
  personName: string;
  description: string;
  detectedAt: string;
  fromDepartments: PersonDepartment[] | null;
  toDepartments: PersonDepartment[] | null;
  fromTitle: string | null;
  toTitle: string | null;
  changedFields: Record<string, unknown> | null;
}

export interface Overview {
  totalPersons: number;
  totalDepartments: number;
  totalAdded: number;
  totalRemoved: number;
  netChange: number;
  recentAdded: number;
  recentRemoved: number;
  recentNetChange: number;
  recentDeptChanged: number;
  recentTitleChanged: number;
  monthAdded: number;
  monthRemoved: number;
  monthNetChange: number;
  totalDeptChanged: number;
  totalTitleChanged: number;
  lastSyncAt: string | null;
  trackingStartedAt: string | null;
  recentChanges: ChangeEvent[];
  deptOverview: DeptOverviewItem[];
}

export interface DeptOverviewItem {
  deptId: string;
  deptName: string;
  deptPath: string;
  personCount: number;
}

export interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_departments: number;
  total_persons: number;
  added_count: number;
  removed_count: number;
  department_changed_count: number;
  title_changed_count: number;
  profile_updated_count: number;
  error_message: string | null;
}

export interface SyncStatus {
  status: 'idle' | 'running' | 'success' | 'failed';
  syncRunId: string | null;
  stageIndex: number;
  stageTotal: number;
  stage: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
  errorMessage: string | null;
  result: {
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
  } | null;
}

export interface SystemStatus {
  dbPath: string;
  dbExists: boolean;
  dbSizeBytes: number;
  lastSyncAt: string | null;
  trackingStartedAt: string | null;
  totalPersons: number;
  totalSnapshots: number;
  dwsAvailable: boolean;
}

export interface AlertItem {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  reason: string;
  deptId: string | null;
  deptName: string | null;
  personName: string | null;
  detectedAt: string;
}

export interface OrganizationHealth {
  level: 'stable' | 'attention' | 'volatile' | 'risk';
  score: number;
  reasons: string[];
  updatedAt: string;
  windowDays: number;
  metrics: {
    totalPersons: number;
    totalDepartments: number;
    added: number;
    removed: number;
    netChange: number;
    departmentChanged: number;
    titleChanged: number;
    alertCount: number;
    criticalAlertCount: number;
    removedRate?: number;
    netDecreaseRate?: number;
    organizationAdjustmentRate?: number;
    deductions?: Array<{
      key: string;
      label: string;
      value: number;
    }>;
  };
  trend: { syncedAt: string; totalPersons: number; totalDepartments: number }[];
  alerts: AlertItem[];
  recentChanges: ChangeEvent[];
}

export interface DepartmentHealth {
  deptId: string;
  deptName: string;
  deptPath: string;
  currentPersons: number;
  addedCount: number;
  removedCount: number;
  netChange: number;
  departmentChangedCount: number;
  titleChangedCount: number;
  tag: '稳定' | '扩张' | '流失关注' | '频繁调整' | '数据不足';
  riskScore: number;
  recentChanges: ChangeEvent[];
}

export interface DepartmentHealthDetail extends DepartmentHealth {
  windowDays: number;
  trend: { syncedAt: string; memberCount: number }[];
}

export interface OrganizationReport {
  period: '7d' | '30d' | 'month';
  label: string;
  generatedAt: string;
  latestSyncAt: string | null;
  summary: {
    currentPersons: number;
    currentDepartments: number;
    added: number;
    removed: number;
    netChange: number;
    departmentChanged: number;
    titleChanged: number;
    alertCount: number;
  };
  addedPersons: ChangeEvent[];
  removedPersons: ChangeEvent[];
  departmentChanges: ChangeEvent[];
  titleChanges: ChangeEvent[];
  volatileDepartments: DepartmentHealth[];
  alerts: AlertItem[];
}
