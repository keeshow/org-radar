import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '../api';
import type { SyncStatus } from '../types';

const pageMeta: Record<string, { title: string; description: string }> = {
  '/': { title: '组织情报总览', description: '观察公司人员变化、稳定性与组织风险' },
  '/contacts': { title: '组织通讯录', description: '按组织结构浏览成员与历史档案' },
  '/department-health': { title: '部门健康', description: '识别部门流失、扩张与调整风险' },
  '/changes': { title: '组织变化记录', description: '追踪新增、离职、调岗与职位变化' },
  '/reports': { title: '组织报告', description: '生成面向管理层的周期摘要' },
  '/settings': { title: '系统设置', description: '配置同步策略与界面偏好' },
};

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const syncing = status?.status === 'running';
  const meta = pageMeta[location.pathname] || pageMeta['/'];

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await api.getSyncStatus();
        if (mounted) setStatus(next);
      } catch { /* status is secondary */ }
    };
    load();
    const timer = window.setInterval(load, syncing ? 2000 : 15000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [syncing]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/contacts?search=${encodeURIComponent(value)}` : '/contacts');
  };

  const sync = async () => {
    if (syncing) return;
    const next = await api.triggerSync();
    setStatus(next);
    window.dispatchEvent(new CustomEvent('organization-sync-started'));
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)', borderColor: 'var(--border)' }}>
      <div className="h-full px-4 sm:px-6 flex items-center gap-4 max-w-[1280px] mx-auto">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate" style={{ color: 'var(--text-main)' }}>{meta.title}</h1>
          <p className="hidden sm:block text-xs mt-0.5 truncate muted">{meta.description}</p>
        </div>

        <form onSubmit={search} className="hidden md:block relative w-64 xl:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索成员、职位或部门"
            className="control w-full h-9 pl-9 pr-3 text-sm"
          />
        </form>

        <div className="hidden sm:flex items-center gap-2 text-xs muted">
          <span className={`w-2 h-2 rounded-full ${syncing ? 'animate-pulse' : ''}`} style={{ background: syncing ? 'var(--primary)' : status?.status === 'failed' ? 'var(--danger)' : 'var(--success)' }} />
          <span>{syncing ? status?.stage || '同步中' : '数据就绪'}</span>
        </div>

        <button
          onClick={sync}
          disabled={syncing}
          className="btn-primary h-9 px-3.5"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{syncing ? '同步中' : '手动同步'}</span>
        </button>
      </div>
    </header>
  );
}
