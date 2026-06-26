import { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, FileText, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import type { ChangeEvent, OrganizationReport as OrganizationReportType } from '../types';
import PersonDrawer from '../components/PersonDrawer';

type Period = '7d' | '30d' | 'month';

export default function OrganizationReport() {
  const [period, setPeriod] = useState<Period>('7d');
  const [report, setReport] = useState<OrganizationReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getOrganizationReport(period).then(setReport).finally(() => setLoading(false));
  }, [period]);

  const narrative = useMemo(() => report ? buildNarrative(report) : '', [report]);
  const copy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(buildCopyText(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-5">
      <section className="surface px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="segmented self-start">
          {([{ value: '7d', label: '最近 7 天' }, { value: '30d', label: '最近 30 天' }, { value: 'month', label: '本月' }] as const).map((item) => (
            <button key={item.value} onClick={() => setPeriod(item.value)} className={`segmented-item h-8 px-3 ${period === item.value ? 'segmented-item-active' : ''}`}>{item.label}</button>
          ))}
        </div>
        <button onClick={copy} disabled={!report} className="btn-primary h-9 px-3.5">
          {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}{copied ? '已复制摘要' : '复制管理摘要'}
        </button>
      </section>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在生成组织报告…</div>
      ) : !report ? (
        <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>报告生成失败</div>
      ) : (
        <>
          <section className="surface overflow-hidden">
            <div className="px-6 py-6 lg:px-8 lg:py-7 border-b divider">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md border flex items-center justify-center shrink-0" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}><FileText className="w-4 h-4" style={{ color: 'var(--primary)' }} /></div>
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: 'var(--text-main)' }}>{report.label}组织摘要</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>生成于 {formatDateTime(report.generatedAt)} · 数据更新至 {formatDateTime(report.latestSyncAt)}</p>
                </div>
              </div>
              <p className="mt-6 max-w-4xl text-[15px] leading-8 muted">{narrative}</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 divide-x divide-y lg:divide-y-0" style={{ borderColor: 'var(--border)' }}>
              <ReportMetric label="当前人数" value={report.summary.currentPersons} />
              <ReportMetric label="一级部门" value={report.summary.currentDepartments} />
              <ReportMetric label="新增" value={`+${report.summary.added}`} tone="green" />
              <ReportMetric label="离职" value={`-${report.summary.removed}`} tone="red" />
              <ReportMetric label="部门调整" value={report.summary.departmentChanged} tone="amber" />
              <ReportMetric label="需要关注" value={report.summary.alertCount} tone={report.summary.alertCount > 0 ? 'amber' : 'default'} />
            </div>
          </section>

          {report.alerts.length > 0 && (
            <section className="rounded-xl border px-5 py-4" style={{ background: 'var(--warning-soft)', borderColor: 'color-mix(in srgb, var(--warning) 24%, transparent)' }}>
              <div className="flex gap-3"><TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} /><div><h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>管理关注项</h2><div className="mt-2 space-y-1">{report.alerts.slice(0, 5).map((alert) => <p key={alert.id} className="text-sm leading-6 muted">{formatAlertText(alert)}</p>)}</div></div></div>
            </section>
          )}

          <section className="surface overflow-hidden">
            <div className="px-5 py-4 border-b divider"><h2 className="section-title">人员与组织变化明细</h2></div>
            <div className="grid lg:grid-cols-2">
              <ReportSection title="新增人员" count={report.addedPersons.length} changes={report.addedPersons} empty="本周期暂无新增人员" tone="green" onPerson={setSelectedPerson} />
              <ReportSection title="离职人员" count={report.removedPersons.length} changes={report.removedPersons} empty="本周期暂无离职人员" tone="red" onPerson={setSelectedPerson} />
              <ReportSection title="部门变动" count={report.departmentChanges.length} changes={report.departmentChanges} empty="本周期暂无部门变动" tone="primary" onPerson={setSelectedPerson} />
              <ReportSection title="职位变动" count={report.titleChanges.length} changes={report.titleChanges} empty="本周期暂无职位变动" tone="amber" onPerson={setSelectedPerson} />
            </div>
          </section>

          <section className="surface overflow-hidden">
            <div className="px-5 py-4 border-b divider"><h2 className="section-title">部门观察</h2></div>
            {report.volatileDepartments.length === 0 ? <p className="px-5 py-8 text-sm" style={{ color: 'var(--text-muted)' }}>本周期暂无明显波动部门</p> : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {report.volatileDepartments.map((department) => (
                  <div key={department.deptId} className="px-5 py-3 grid grid-cols-[minmax(160px,1fr)_80px_80px_80px_100px] items-center text-xs">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{department.deptName}</span>
                    <span style={{ color: 'var(--success)' }}>新增 +{department.addedCount}</span>
                    <span style={{ color: 'var(--danger)' }}>离职 -{department.removedCount}</span>
                    <span className="muted">净 {signed(department.netChange)}</span>
                    <span className="text-right" style={{ color: 'var(--text-muted)' }}>{departmentObservationLabel(department)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {selectedPerson && <PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} />}
    </div>
  );
}

function ReportMetric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'green' | 'red' | 'amber' }) {
  const color = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : tone === 'amber' ? 'var(--warning)' : 'var(--text-main)';
  return <div className="px-4 py-4"><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="mt-1 text-xl font-semibold" style={{ color }}>{value}</p></div>;
}

function ReportSection({ title, count, changes, empty, tone, onPerson }: { title: string; count: number; changes: ChangeEvent[]; empty: string; tone: 'green' | 'red' | 'primary' | 'amber'; onPerson: (id: string) => void }) {
  const dotColor = tone === 'green' ? 'var(--success)' : tone === 'red' ? 'var(--danger)' : tone === 'amber' ? 'var(--warning)' : 'var(--primary)';
  return (
    <div className="min-h-48 border-b lg:border-r divider">
      <div className="surface-subtle h-11 px-5 flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: dotColor }} /><h3 className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{title}</h3></div><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{count}</span></div>
      {changes.length === 0 ? <p className="px-5 py-8 text-xs" style={{ color: 'var(--text-muted)' }}>{empty}</p> : <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{changes.slice(0, 10).map((change) => <button key={change.id} onClick={() => onPerson(change.userId)} className="hover-surface w-full px-5 py-3 text-left"><div className="flex justify-between gap-3"><span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>{change.personName}</span><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatDate(change.detectedAt)}</span></div><p className="mt-1 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{change.description}</p></button>)}</div>}
    </div>
  );
}

function buildNarrative(report: OrganizationReportType) {
  const movement = report.summary.netChange === 0 ? '组织规模保持不变' : report.summary.netChange > 0 ? `组织净增长 ${report.summary.netChange} 人` : `组织净减少 ${Math.abs(report.summary.netChange)} 人`;
  const focusDepartments = report.volatileDepartments
    .filter((department) => department.removedCount > 0 || department.netChange < 0)
    .slice(0, 3);
  const focusText = focusDepartments.length > 0
    ? `${focusDepartments.map((department) => `${department.deptName}离职 ${department.removedCount} 人、净变化 ${signed(department.netChange)}`).join('；')}，建议观察相关部门人员流动。`
    : '当前未发现需要重点观察的部门。';
  return `${report.label}内，公司新增 ${report.summary.added} 人、离职 ${report.summary.removed} 人，${movement}。期间发生 ${report.summary.departmentChanged} 次部门调整和 ${report.summary.titleChanged} 次职位变化。${focusText}${report.summary.alertCount > 0 ? `系统识别到 ${report.summary.alertCount} 条需要管理层关注的组织信号。` : '整体组织运行平稳。'}`;
}

function buildCopyText(report: OrganizationReportType) {
  return [`【${report.label}组织摘要】`, buildNarrative(report), '', `当前人数：${report.summary.currentPersons}`, `一级部门：${report.summary.currentDepartments}`, `新增：${report.summary.added}`, `离职：${report.summary.removed}`, `净变化：${signed(report.summary.netChange)}`, '', ...report.alerts.slice(0, 5).map((alert) => `关注：${formatAlertText(alert)}`)].join('\n');
}

function departmentObservationLabel(department: OrganizationReportType['volatileDepartments'][number]) {
  if (department.tag === '流失关注' || department.tag === '频繁调整') return department.tag;
  if (department.removedCount > 0 || department.netChange < 0) return '需要观察';
  if (department.departmentChangedCount > 0 || department.titleChangedCount > 0) return '组织变化';
  return department.tag;
}

function formatAlertText(alert: OrganizationReportType['alerts'][number]) {
  const prefix = alert.title ? `${alert.title}：` : '';
  const dept = alert.deptName ? `（${alert.deptName}）` : '';
  if (alert.personName) return `${prefix}${alert.personName}${dept} 已从通讯录中移除`;
  return `${prefix}${alert.reason}`;
}

function signed(value: number) { return `${value >= 0 ? '+' : ''}${value}`; }
function formatDate(iso: string) { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function formatDateTime(iso: string | null) { return iso ? new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无'; }
