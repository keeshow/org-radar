import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Radar,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api';
import type { ChangeEvent, DepartmentHealth, OrganizationHealth, Overview, SyncStatus } from '../types';
import PersonDrawer from '../components/PersonDrawer';
import SmoothTrendChart from '../components/SmoothTrendChart';

const RECENT_CHANGE_LIMIT = 5;

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [health, setHealth] = useState<OrganizationHealth | null>(null);
  const [departments, setDepartments] = useState<DepartmentHealth[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [overview, organizationHealth, departmentHealth, status] = await Promise.all([
        api.getOverview(),
        api.getOrganizationHealth(),
        api.getDepartmentsHealth(30),
        api.getSyncStatus(),
      ]);
      setData(overview);
      setHealth(organizationHealth);
      setDepartments(departmentHealth.departments);
      setSyncStatus(status);
      setError('');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onSync = () => setTimeout(load, 1500);
    window.addEventListener('organization-sync-started', onSync);
    return () => window.removeEventListener('organization-sync-started', onSync);
  }, []);

  useEffect(() => {
    if (syncStatus?.status !== 'running') return;
    const timer = window.setInterval(async () => {
      const status = await api.getSyncStatus();
      setSyncStatus(status);
      if (status.status !== 'running') load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [syncStatus?.status]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data || !health) return <ErrorState message="暂无组织数据" onRetry={load} />;

  const focusDepartments = [...departments]
    .sort((a, b) => b.riskScore - a.riskScore || b.removedCount - a.removedCount)
    .slice(0, 6);
  const syncMetricValue = syncStatus?.status === 'running'
    ? `${syncStatus.stageIndex}/${syncStatus.stageTotal}`
    : syncStatus?.status === 'failed'
      ? '同步失败'
      : '数据就绪';

  return (
    <div className="space-y-5">
      <section className="surface metric-strip overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1" style={{ borderColor: 'var(--border)' }}>
          <StatusMetric icon={<Users />} label="当前人数" value={`${data.totalPersons}`} suffix="人" />
          <StatusMetric icon={<Building2 />} label="一级部门" value={`${data.totalDepartments}`} suffix="个" />
          <StatusMetric
            icon={<Radar />}
            label="同步状态"
            value={syncMetricValue}
            tone={syncStatus?.status === 'failed' ? 'red' : syncStatus?.status === 'running' ? 'primary' : 'green'}
          />
          <StatusMetric icon={<TrendingUp />} label="最近同步" value={formatDateTime(data.lastSyncAt)} />
          <StatusMetric icon={<CalendarDays />} label="统计开始" value={formatDateTime(data.trackingStartedAt)} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.8fr)] gap-5">
        <section className="surface signal-panel overflow-hidden">
          <div className="panel-header px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="section-title">组织规模与稳定性</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-semibold ${healthTone(health.level)}`}>{health.score}<span className="text-sm" style={{ color: 'var(--text-muted)' }}>/100</span></span>
              <span className={`status-pill ${healthPill(health.level)}`}>{healthText(health.level)}</span>
            </div>
          </div>

          <div className="p-5 border-b divider">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>组织人数趋势</h3>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>共 {health.trend.length} 个变动节点</span>
            </div>
            <SmoothTrendChart
              points={health.trend.map((point) => ({ label: shortDate(point.syncedAt), tooltipLabel: formatEventTime(point.syncedAt), value: point.totalPersons }))}
              ariaLabel="组织人数趋势图"
            />
          </div>

          <div className="grid md:grid-cols-[280px_1fr] min-h-[270px]">
            <div className="p-5 border-b md:border-b-0 md:border-r divider">
              <div className="flex items-center gap-2 mb-2">
                <Radar className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>部门稳定雷达</h3>
              </div>
              <DepartmentRadar departments={focusDepartments} />
            </div>
            <div className="p-5">
              <p className="section-kicker mb-3">近 30 天信号</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <Signal label="新增" value={health.metrics.added} icon={<UserPlus />} tone="green" />
                <Signal label="离职" value={health.metrics.removed} icon={<UserMinus />} tone="red" />
                <Signal label="净变化" value={signed(health.metrics.netChange)} icon={<TrendingUp />} tone={health.metrics.netChange >= 0 ? 'green' : 'red'} />
                <Signal label="部门调整" value={health.metrics.departmentChanged} icon={<Building2 />} tone="amber" />
              </div>
              <div className="mt-5 pt-4 border-t divider space-y-2">
                {(health.reasons.length ? health.reasons : ['近 30 天组织运行平稳']).slice(0, 3).map((reason) => (
                  <div key={reason} className="flex items-center gap-2 text-xs muted">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                    {reason}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="surface signal-panel overflow-hidden flex flex-col xl:min-h-[560px]">
          <div className="panel-header px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="section-title">最近变化情报流</h2>
            </div>
            <button onClick={() => navigate('/changes')} className="text-xs link-primary inline-flex items-center gap-1">
              全部记录 <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1">
            {data.recentChanges.length === 0 ? (
              <div className="h-full min-h-60 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>暂无人员变化</div>
            ) : data.recentChanges.slice(0, RECENT_CHANGE_LIMIT).map((change, index) => (
              <IntelligenceEvent
                key={change.id}
                change={change}
                last={index === Math.min(data.recentChanges.length, RECENT_CHANGE_LIMIT) - 1}
                onClick={() => setSelectedPerson(change.userId)}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="surface signal-panel overflow-hidden">
        <div className="panel-header px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="section-title">部门关注矩阵</h2>
          </div>
          <button onClick={() => navigate('/department-health')} className="text-xs link-primary inline-flex items-center gap-1">
            查看部门健康 <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {focusDepartments.map((department) => (
            <button
              key={department.deptId}
              onClick={() => navigate(`/department-health?dept=${department.deptId}`)}
              className="hover-surface text-left px-5 py-4 border-b md:border-r divider transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-main)' }}>{department.deptName}</span>
                <DepartmentStatus department={department} />
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div><span className="text-2xl font-semibold" style={{ color: 'var(--text-main)' }}>{department.currentPersons}</span><span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>人</span></div>
                <div className="text-xs muted">净变化 <span style={{ color: department.netChange < 0 ? 'var(--danger)' : 'var(--success)' }}>{signed(department.netChange)}</span></div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedPerson && <PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </div>
  );
}

function StatusMetric({ icon, label, value, suffix, tone = 'default' }: { icon: ReactNode; label: string; value: string; suffix?: string; tone?: 'default' | 'green' | 'red' | 'primary' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : tone === 'primary' ? 'var(--primary)' : 'var(--text-main)';
  return (
    <div className="px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] leading-4 [&_svg]:w-3.5 [&_svg]:h-3.5" style={{ color: 'var(--text-muted)' }}>{icon}{label}</div>
      <div className="mt-0.5 text-[15px] leading-5 font-semibold truncate" style={{ color }}>{value}{suffix && <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{suffix}</span>}</div>
    </div>
  );
}

function Signal({ label, value, icon, tone }: { label: string; value: number | string; icon: ReactNode; tone: 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : 'var(--warning)';
  const background = tone === 'green' ? 'var(--success-soft)' : tone === 'red' ? 'var(--danger-soft)' : 'var(--warning-soft)';
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-md flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4" style={{ background, color }}>{icon}</div>
      <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{value}</p></div>
    </div>
  );
}

function DepartmentRadar({ departments }: { departments: DepartmentHealth[] }) {
  const items = departments.slice(0, 6);
  if (items.length < 3) return <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>数据积累中</div>;
  const center = 50;
  const radius = 34;
  const point = (index: number, value = 1) => {
    const angle = -Math.PI / 2 + (index / items.length) * Math.PI * 2;
    return [center + Math.cos(angle) * radius * value, center + Math.sin(angle) * radius * value];
  };
  const polygon = items.map((department, index) => point(index, Math.max(.2, 1 - Math.min(80, department.riskScore) / 100)).join(',')).join(' ');
  return (
    <div className="relative h-52">
      <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label="部门稳定雷达图">
        {[1, .66, .33].map((level) => <polygon key={level} points={items.map((_, index) => point(index, level).join(',')).join(' ')} fill="none" stroke="var(--border)" strokeWidth=".5" />)}
        {items.map((_, index) => { const [x, y] = point(index); return <line key={index} x1={center} y1={center} x2={x} y2={y} stroke="var(--border)" strokeWidth=".5" />; })}
        <polygon points={polygon} fill="var(--chart-fill)" stroke="var(--primary)" strokeWidth="1.2" />
        {items.map((department, index) => { const [x, y] = point(index, 1.2); return <text key={department.deptId} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="4" fill="var(--text-sub)">{shortName(department.deptName)}</text>; })}
      </svg>
    </div>
  );
}

function IntelligenceEvent({ change, last, onClick }: { change: ChangeEvent; last: boolean; onClick: () => void }) {
  const visual = eventVisual(change.type);
  return (
    <button type="button" onClick={onClick} className="hover-surface w-full text-left px-5 py-4 flex gap-3 transition-colors">
      <div className="relative flex flex-col items-center">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 ring-4 ${visual.dot}`} />
        {!last && <span className="absolute top-5 bottom-[-20px] w-px" style={{ background: 'var(--border)' }} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm truncate" style={{ color: 'var(--text-main)' }}><span className="font-medium">{change.personName}</span> <span className="muted">{visual.action}</span></p>
          <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatEventTime(change.detectedAt)}</span>
        </div>
        <p className="mt-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>{change.description}</p>
        <span className={`event-pill mt-2 ${visual.pill}`}>{visual.label}</span>
      </div>
    </button>
  );
}

function DepartmentStatus({ department }: { department: DepartmentHealth }) {
  const state = departmentState(department);
  return <span className={`status-pill ${state.className}`}>{state.label}</span>;
}

function departmentState(department: DepartmentHealth) {
  if (department.tag === '流失关注' || department.tag === '频繁调整') return { label: '波动', className: 'status-danger' };
  if (department.riskScore > 0 || department.tag === '数据不足') return { label: '关注', className: 'status-warning' };
  return { label: '稳定', className: 'status-success' };
}

function eventVisual(type: string) {
  const map: Record<string, { label: string; action: string; dot: string; pill: string }> = {
    person_added: { label: '新增', action: '加入组织', dot: 'bg-[var(--success)] ring-[var(--success-soft)]', pill: 'status-success' },
    person_removed: { label: '离职', action: '离开组织', dot: 'bg-[var(--danger)] ring-[var(--danger-soft)]', pill: 'status-danger' },
    department_changed: { label: '部门变化', action: '调整了部门', dot: 'bg-[var(--primary)] ring-[var(--primary-soft)]', pill: 'status-primary' },
    title_changed: { label: '职位变化', action: '更新了职位', dot: 'bg-[var(--warning)] ring-[var(--warning-soft)]', pill: 'status-warning' },
  };
  return map[type] || { label: '信息更新', action: '更新了资料', dot: 'bg-[var(--text-muted)] ring-[var(--surface-subtle)]', pill: 'status-neutral' };
}

function healthText(level: OrganizationHealth['level']) { return level === 'stable' ? '稳定' : level === 'attention' ? '关注' : level === 'volatile' ? '波动' : '风险'; }
function healthTone(level: OrganizationHealth['level']) { return level === 'stable' ? 'text-[var(--success)]' : level === 'attention' ? 'text-[var(--warning)]' : 'text-[var(--danger)]'; }
function healthPill(level: OrganizationHealth['level']) { return level === 'stable' ? 'status-success' : level === 'attention' ? 'status-warning' : 'status-danger'; }
function signed(value: number) { return `${value >= 0 ? '+' : ''}${value}`; }
function shortName(name: string) { return name.length > 6 ? `${name.slice(0, 5)}…` : name; }
function shortDate(iso: string) { return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); }
function formatDateTime(iso: string | null) { return iso ? new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无'; }
function formatEventTime(iso: string) { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

function LoadingState() { return <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在加载组织情报…</div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="h-64 flex flex-col items-center justify-center gap-3 text-sm muted"><p>{message}</p><button onClick={onRetry} className="link-primary">重新加载</button></div>; }
