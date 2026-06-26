import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ArrowDown, ArrowUp, Building2, ChevronRight, CircleAlert, Users } from 'lucide-react';
import { api } from '../api';
import type { DepartmentHealth as DepartmentHealthType, DepartmentHealthDetail } from '../types';
import PersonDrawer from '../components/PersonDrawer';

export default function DepartmentHealth() {
  const [searchParams] = useSearchParams();
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const [departments, setDepartments] = useState<DepartmentHealthType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('dept'));
  const [detail, setDetail] = useState<DepartmentHealthDetail | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getDepartmentsHealth(windowDays).then((result) => {
      setDepartments(result.departments);
      setSelectedId((current) => current || result.departments[0]?.deptId || null);
    }).finally(() => setLoading(false));
  }, [windowDays]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.getDepartmentHealth(selectedId, windowDays).then(setDetail).catch(console.error);
  }, [selectedId, windowDays]);

  const summary = useMemo(() => ({
    stable: departments.filter((department) => departmentState(department).key === 'stable').length,
    attention: departments.filter((department) => departmentState(department).key !== 'stable').length,
    added: departments.reduce((sum, department) => sum + department.addedCount, 0),
    removed: departments.reduce((sum, department) => sum + department.removedCount, 0),
    changed: departments.reduce((sum, department) => sum + department.departmentChangedCount, 0),
  }), [departments]);

  if (loading) return <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在生成部门健康报告…</div>;

  return (
    <div className="space-y-5">
      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b divider">
          <div>
            <p className="text-xs muted">基于近 {windowDays} 天人员流动与组织调整</p>
          </div>
          <div className="segmented">
            {[7, 30].map((days) => <button key={days} onClick={() => setWindowDays(days as 7 | 30)} className={`segmented-item h-7 px-3 ${windowDays === days ? 'segmented-item-active' : ''}`}>{days} 天</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0" style={{ borderColor: 'var(--border)' }}>
          <SummaryMetric label="稳定部门" value={summary.stable} tone="green" />
          <SummaryMetric label="关注部门" value={summary.attention} tone={summary.attention > 0 ? 'amber' : 'default'} />
          <SummaryMetric label="新增人员" value={summary.added} tone="green" />
          <SummaryMetric label="离职人员" value={summary.removed} tone={summary.removed > 0 ? 'red' : 'default'} />
          <SummaryMetric label="部门变动" value={summary.changed} tone={summary.changed > 0 ? 'amber' : 'default'} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <section className="surface overflow-hidden">
          <div className="px-5 py-4 border-b divider">
            <h2 className="section-title">部门风险矩阵</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_80px_72px_72px_80px_80px_90px_24px] px-5 h-10 items-center border-b divider text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                <span>部门</span><span>人数</span><span>新增</span><span>离职</span><span>净变化</span><span>调整</span><span>状态</span><span />
              </div>
              {departments.map((department) => {
                const state = departmentState(department);
                const selected = selectedId === department.deptId;
                return (
                  <button
                    key={department.deptId}
                    onClick={() => setSelectedId(department.deptId)}
                    className={`w-full grid grid-cols-[minmax(180px,1.5fr)_80px_72px_72px_80px_80px_90px_24px] px-5 min-h-14 items-center border-b divider text-left transition-colors ${selected ? 'status-primary border-x-0 border-t-0' : 'hover-surface'}`}
                  >
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>{department.deptName}</span>
                    <span className="text-sm muted">{department.currentPersons}</span>
                    <span className="text-xs" style={{ color: 'var(--success)' }}>+{department.addedCount}</span>
                    <span className="text-xs" style={{ color: 'var(--danger)' }}>-{department.removedCount}</span>
                    <span className="text-xs" style={{ color: department.netChange < 0 ? 'var(--danger)' : 'var(--success)' }}>{signed(department.netChange)}</span>
                    <span className="text-xs muted">{department.departmentChangedCount}</span>
                    <span><span className={`status-pill ${state.className}`}>{state.label}</span></span>
                    <ChevronRight className="w-4 h-4" style={{ color: selected ? 'var(--primary)' : 'var(--text-muted)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="surface overflow-hidden xl:sticky xl:top-20">
          {!detail ? (
            <div className="h-80 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>选择部门查看健康详情</div>
          ) : (
            <>
              <div className="px-5 py-5 border-b divider">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-main)' }}>{detail.deptName}</h2>
                  </div>
                  <span className={`status-pill ${departmentState(detail).className}`}>{departmentState(detail).label}</span>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div><span className="text-4xl font-semibold" style={{ color: 'var(--text-main)' }}>{detail.currentPersons}</span><span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>人</span></div>
                  <div className="text-right"><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>风险指数</p><p className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{detail.riskScore}</p></div>
                </div>
              </div>

              <div className="px-5 py-4 border-b divider">
                <div className="grid grid-cols-3 gap-3">
                  <DetailSignal icon={<ArrowUp />} label="新增" value={detail.addedCount} tone="green" />
                  <DetailSignal icon={<ArrowDown />} label="离职" value={detail.removedCount} tone="red" />
                  <DetailSignal icon={<Activity />} label="调整" value={detail.departmentChangedCount} tone="amber" />
                </div>
              </div>

              <div className="px-5 py-4 border-b divider">
                <div className="flex items-center gap-2 mb-3"><Users className="w-3.5 h-3.5" style={{ color: 'var(--primary)' }} /><h3 className="text-xs font-medium muted">人数趋势</h3></div>
                <MiniTrend points={detail.trend.map((point) => point.memberCount)} />
              </div>

              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3"><CircleAlert className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} /><h3 className="text-xs font-medium muted">最近变化</h3></div>
                {detail.recentChanges.length === 0 ? <p className="text-xs py-4" style={{ color: 'var(--text-muted)' }}>当前周期暂无人员变化</p> : (
                  <div className="space-y-1">
                    {detail.recentChanges.slice(0, 6).map((change) => (
                      <button key={change.id} onClick={() => setSelectedPerson(change.userId)} className="hover-surface w-full px-2 py-2 rounded-md text-left">
                        <div className="flex justify-between gap-2"><span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{change.personName}</span><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{shortDate(change.detectedAt)}</span></div>
                        <p className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{change.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {selectedPerson && <PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </div>
  );
}

function SummaryMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : tone === 'amber' ? 'var(--warning)' : 'var(--text-main)';
  return <div className="px-5 py-4"><p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</p></div>;
}

function DetailSignal({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : 'var(--warning)';
  const background = tone === 'green' ? 'var(--success-soft)' : tone === 'red' ? 'var(--danger-soft)' : 'var(--warning-soft)';
  return <div className="text-center"><div className="mx-auto w-7 h-7 rounded-md flex items-center justify-center [&_svg]:w-3.5 [&_svg]:h-3.5" style={{ background, color }}>{icon}</div><p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{value}</p><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p></div>;
}

function MiniTrend({ points }: { points: number[] }) {
  if (points.length === 0) return <div className="h-20 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>数据积累中</div>;
  const visible = points.slice(-24);
  const min = Math.min(...visible), max = Math.max(...visible), range = Math.max(1, max - min);
  const coords = visible.map((value, index) => {
    const x = visible.length === 1 ? 50 : (index / (visible.length - 1)) * 100;
    const y = 80 - ((value - min) / range) * 60;
    return { x, y };
  });
  const line = coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const area = `0,80 ${line} 100,80`;
  const gradientId = `mini-trend-fill-${visible.length}-${min}-${max}`;
  return <div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity="0.12" /><stop offset="100%" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs><polygon points={area} fill={`url(#${gradientId})`} /><polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}><span>{visible[0]} 人</span><span>{visible[visible.length - 1]} 人</span></div></div>;
}

function departmentState(department: DepartmentHealthType) {
  if (department.tag === '流失关注' || department.tag === '频繁调整') return { key: 'volatile', label: '波动', className: 'status-danger' };
  if (department.riskScore > 0 || department.tag === '数据不足') return { key: 'attention', label: '关注', className: 'status-warning' };
  return { key: 'stable', label: '稳定', className: 'status-success' };
}

function signed(value: number) { return `${value >= 0 ? '+' : ''}${value}`; }
function shortDate(iso: string) { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
