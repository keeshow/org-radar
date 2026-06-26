const BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function postJson<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function postJsonBody<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function putJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

import type {
  AlertItem,
  ChangeEvent,
  Department,
  DepartmentHealth,
  DepartmentHealthDetail,
  OrganizationHealth,
  OrganizationReport,
  Overview,
  Person,
  PersonDetail,
  PublicAppConfig,
  SyncLog,
  SyncStatus,
  SystemStatus,
} from '../types';

export const api = {
  getPublicConfig: () => fetchJson<PublicAppConfig>('/public/config'),

  getAuthStatus: () => fetchJson<{ authenticated: boolean }>('/auth/status'),

  verifyAccessCode: (code: string) => postJsonBody<{ success: boolean }>('/auth/verify', { code }),

  logout: () => postJson<{ success: boolean }>('/auth/logout'),

  getOverview: () => fetchJson<Overview>('/overview'),

  getContacts: (params?: { search?: string; deptId?: string; status?: string; scope?: 'direct' | 'tree' }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.deptId) qs.set('deptId', params.deptId);
    if (params?.status) qs.set('status', params.status);
    if (params?.scope) qs.set('scope', params.scope);
    const q = qs.toString();
    return fetchJson<Person[]>(`/contacts${q ? `?${q}` : ''}`);
  },

  getPerson: (userId: string) => fetchJson<PersonDetail>(`/contacts/${userId}`),

  getDepartments: () => fetchJson<Department[]>('/departments'),

  getOrganizationHealth: () => fetchJson<OrganizationHealth>('/organization/health'),

  getAlerts: (windowDays = 30) => fetchJson<{ alerts: AlertItem[]; windowDays: number }>(`/alerts?window=${windowDays}`),

  getDepartmentsHealth: (windowDays = 30) =>
    fetchJson<{ departments: DepartmentHealth[]; windowDays: number }>(`/departments/health?window=${windowDays}`),

  getDepartmentHealth: (deptId: string, windowDays = 30) =>
    fetchJson<DepartmentHealthDetail>(`/departments/${deptId}/health?window=${windowDays}`),

  getOrganizationReport: (period: '7d' | '30d' | 'month') =>
    fetchJson<OrganizationReport>(`/reports/organization?period=${period}`),

  getChanges: (params?: { type?: string; deptId?: string; startDate?: string; endDate?: string; search?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.deptId) qs.set('deptId', params.deptId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return fetchJson<{ changes: ChangeEvent[]; total: number; page: number; limit: number; hasMore: boolean }>(`/changes${q ? `?${q}` : ''}`);
  },

  triggerSync: () => postJson<SyncStatus>('/sync'),

  getSyncStatus: () => fetchJson<SyncStatus>('/sync/status'),

  getSyncLogs: (page?: number) => {
    const qs = new URLSearchParams();
    if (page) qs.set('page', String(page));
    const q = qs.toString();
    return fetchJson<{ logs: SyncLog[]; total: number; page: number }>(`/sync/logs${q ? `?${q}` : ''}`);
  },

  getSystemStatus: () => fetchJson<SystemStatus>('/system/status'),

  createBackup: () => postJson<{ success: boolean; filePath: string }>('/backup'),

  getSettings: () => fetchJson<{
    syncEnabled: boolean;
    syncMode: 'schedule' | 'interval';
    syncTimes: string[];
    syncIntervalMinutes: number;
    syncTime1: string;
    syncTime2: string;
    theme: string;
  }>('/settings'),

  updateSettings: (body: {
    syncEnabled?: boolean;
    syncMode?: 'schedule' | 'interval';
    syncTimes?: string[];
    syncIntervalMinutes?: number;
    syncTime1?: string;
    syncTime2?: string;
    theme?: string;
  }) =>
    putJson<{ success: boolean }>('/settings', body),
};
