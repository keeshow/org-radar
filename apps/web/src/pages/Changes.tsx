import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';
import { api } from '../api';
import type { ChangeEvent, Department } from '../types';
import PersonDrawer from '../components/PersonDrawer';

const types = [
  { value: '', label: '全部类型' },
  { value: 'person_added', label: '新增' },
  { value: 'person_removed', label: '离职' },
  { value: 'department_changed', label: '部门变化' },
  { value: 'title_changed', label: '职位变化' },
  { value: 'profile_updated', label: '资料更新' },
];

export default function Changes() {
  const [changes, setChanges] = useState<ChangeEvent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [deptId, setDeptId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  useEffect(() => { api.getDepartments().then(setDepartments).catch(console.error); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 250);
    return () => window.clearTimeout(timer);
  }, [search, type, deptId, startDate, endDate]);

  const load = async (nextPage: number) => {
    setLoading(true);
    try {
      const result = await api.getChanges({
        search: search || undefined,
        type: type || undefined,
        deptId: deptId || undefined,
        startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
        page: nextPage,
        limit: 50,
      });
      setChanges(result.changes);
      setPage(result.page);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const result: Array<{ key: string; label: string; items: ChangeEvent[] }> = [];
    for (const change of changes) {
      const key = new Date(change.detectedAt).toLocaleDateString('zh-CN');
      const last = result[result.length - 1];
      if (!last || last.key !== key) result.push({ key, label: formatDay(change.detectedAt), items: [change] });
      else last.items.push(change);
    }
    return result;
  }, [changes]);

  const departmentOptions = flattenDepartments(departments);

  return (
    <div className="space-y-4">
      <section className="surface px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_150px_180px_150px_150px] gap-2">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索人员姓名" className="control w-full h-9 pl-9 pr-3 text-sm" />
          </label>
          <label className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <select value={type} onChange={(event) => setType(event.target.value)} className="control w-full h-9 pl-8 pr-2 text-xs appearance-none">{types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </label>
          <select value={deptId} onChange={(event) => setDeptId(event.target.value)} className="control w-full h-9 px-3 text-xs">
            <option value="">全部部门</option>
            {departmentOptions.map((department) => <option key={department.deptId} value={department.deptId}>{department.label}</option>)}
          </select>
          <label className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="control w-full h-9 pl-8 pr-2 text-xs" />
          </label>
          <label className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="control w-full h-9 pl-8 pr-2 text-xs" />
          </label>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="h-12 px-5 flex items-center justify-between border-b divider">
          <div><span className="section-title">事件时间线</span><span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>共 {total} 条</span></div>
          {(search || type || deptId || startDate || endDate) && <button onClick={() => { setSearch(''); setType(''); setDeptId(''); setStartDate(''); setEndDate(''); }} className="text-xs link-primary">清除筛选</button>}
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在筛选变化记录…</div>
        ) : grouped.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>当前条件下暂无变化记录</div>
        ) : (
          <div>
            {grouped.map((group) => (
              <div key={group.key}>
                <div className="surface-subtle h-9 px-5 flex items-center border-y divider text-[11px] font-medium muted">{group.label}</div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {group.items.map((change, index) => <TimelineEvent key={change.id} change={change} last={index === group.items.length - 1} onClick={() => setSelectedPerson(change.userId)} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-12 px-5 flex items-center justify-between border-t divider text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>第 {page} 页</span>
          <div className="flex items-center gap-1">
            <button onClick={() => load(page - 1)} disabled={page <= 1} className="hover-surface w-8 h-8 inline-flex items-center justify-center rounded-md disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => load(page + 1)} disabled={!hasMore} className="hover-surface w-8 h-8 inline-flex items-center justify-center rounded-md disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </section>

      {selectedPerson && <PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </div>
  );
}

function TimelineEvent({ change, last, onClick }: { change: ChangeEvent; last: boolean; onClick: () => void }) {
  const visual = eventVisual(change.type);
  const department = change.toDepartments?.[0]?.deptPath || change.fromDepartments?.[0]?.deptPath || '';
  return (
    <button type="button" onClick={onClick} className="hover-surface w-full min-h-16 px-5 py-3 flex items-start gap-3 text-left transition-colors">
      <div className="relative flex flex-col items-center self-stretch pt-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ring-4 ${visual.dot}`} />
        {!last && <span className="absolute top-5 bottom-[-14px] w-px" style={{ background: 'var(--border)' }} />}
      </div>
      <span className={`event-pill mt-0.5 ${visual.pill}`}>{visual.label}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm" style={{ color: 'var(--text-main)' }}><span className="font-medium">{change.personName}</span><span className="ml-1 muted">{visual.action}</span></p>
        <p className="mt-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{department || change.description}</p>
      </div>
      <span className="text-[11px] whitespace-nowrap mt-1" style={{ color: 'var(--text-muted)' }}>{formatTime(change.detectedAt)}</span>
    </button>
  );
}

function eventVisual(type: string) {
  const map: Record<string, { label: string; action: string; dot: string; pill: string }> = {
    person_added: { label: '新增', action: '加入组织', dot: 'bg-[var(--success)] ring-[var(--success-soft)]', pill: 'status-success' },
    person_removed: { label: '离职', action: '离开组织', dot: 'bg-[var(--danger)] ring-[var(--danger-soft)]', pill: 'status-danger' },
    department_changed: { label: '部门变化', action: '调整了部门', dot: 'bg-[var(--primary)] ring-[var(--primary-soft)]', pill: 'status-primary' },
    title_changed: { label: '职位变化', action: '更新了职位', dot: 'bg-[var(--warning)] ring-[var(--warning-soft)]', pill: 'status-warning' },
  };
  return map[type] || { label: '资料更新', action: '更新了资料', dot: 'bg-[var(--text-muted)] ring-[var(--surface-subtle)]', pill: 'status-neutral' };
}

function flattenDepartments(departments: Department[], depth = 0): Array<{ deptId: string; label: string }> {
  return departments.flatMap((department) => [
    { deptId: department.deptId, label: `${'　'.repeat(depth)}${department.deptName}` },
    ...flattenDepartments(department.children, depth + 1),
  ]);
}

function formatDay(iso: string) { return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); }
function formatTime(iso: string) { return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
