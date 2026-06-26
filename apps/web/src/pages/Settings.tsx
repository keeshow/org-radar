import { useEffect, useState } from 'react';
import { CalendarClock, Clock3, Database, Moon, RefreshCw, Sun, TimerReset, X } from 'lucide-react';
import { api } from '../api';
import { useTheme } from '../components/ThemeProvider';
import Switch from '../components/Switch';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncMode, setSyncMode] = useState<'schedule' | 'interval'>('schedule');
  const [syncTimes, setSyncTimes] = useState<string[]>(['', '', '', '', '']);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then((settings) => {
      setSyncEnabled(settings.syncEnabled);
      setSyncMode(settings.syncMode || 'schedule');
      setSyncTimes(padTimes(sortTimes(settings.syncTimes || [settings.syncTime1, settings.syncTime2])));
      setSyncIntervalMinutes(Math.max(10, settings.syncIntervalMinutes || 60));
    }).finally(() => setLoading(false));
  }, []);

  const duplicates = duplicateTimes(syncTimes);
  const invalidInterval = syncMode === 'interval' && syncIntervalMinutes < 10;
  const saveDisabled = saving || duplicates.length > 0 || invalidInterval;

  const save = async () => {
    if (saveDisabled) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings({ syncEnabled, syncMode, syncTimes: sortTimes(cleanTimes(syncTimes)), syncIntervalMinutes });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const updateTime = (index: number, value: string) => {
    setSyncTimes((current) => {
      const next = [...current];
      if (value && next.some((time, timeIndex) => timeIndex !== index && time === value)) return current;
      next[index] = value;
      return next;
    });
  };

  if (loading) return <div className="h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在读取系统设置…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <SettingSection icon={theme === 'light' ? <Sun /> : <Moon />} title="主题" description="选择适合当前工作环境的界面主题">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{theme === 'light' ? '浅色主题' : '深色主题'}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>组织雷达默认使用浅色分析工作区</p></div>
          <Switch checked={theme === 'dark'} onChange={toggleTheme} />
        </div>
      </SettingSection>

      <SettingSection icon={<RefreshCw />} title="自动同步" description="控制系统是否按照同步策略自动读取钉钉通讯录">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>启用自动同步</p><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>关闭后仍可以在顶部工具栏手动同步</p></div>
          <Switch checked={syncEnabled} onChange={setSyncEnabled} />
        </div>
      </SettingSection>

      {syncEnabled && (
      <SettingSection icon={<TimerReset />} title="同步策略" description="选择固定时间或轮询间隔，两种策略不会同时执行">
        <div>
          <div className="segmented grid grid-cols-2 gap-2">
            <button onClick={() => setSyncMode('schedule')} className={`segmented-item h-9 flex items-center justify-center gap-2 ${syncMode === 'schedule' ? 'segmented-item-active' : ''}`}><CalendarClock className="w-4 h-4" />定时同步</button>
            <button onClick={() => setSyncMode('interval')} className={`segmented-item h-9 flex items-center justify-center gap-2 ${syncMode === 'interval' ? 'segmented-item-active' : ''}`}><TimerReset className="w-4 h-4" />轮询同步</button>
          </div>

          {syncMode === 'schedule' ? (
            <div className="mt-5">
              <p className="text-xs muted mb-3">每天最多执行 5 次，保存时自动按时间先后排列。</p>
              <div className="space-y-2">
                {syncTimes.map((time, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Clock3 className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="w-12 text-xs muted">第 {index + 1} 次</span>
                    <input type="time" value={time} onChange={(event) => updateTime(index, event.target.value)} className="control h-9 flex-1 max-w-xs px-3 text-sm" />
                    <button onClick={() => updateTime(index, '')} disabled={!time} className="hover-surface w-8 h-8 inline-flex items-center justify-center rounded-md disabled:opacity-25" style={{ color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              {duplicates.length > 0 && <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>同步时间不能重复：{duplicates.join('、')}</p>}
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-xs muted mb-3">以上一次成功同步时间为起点，最短间隔为 10 分钟。</p>
              <div className="flex items-center gap-3">
                <TimerReset className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs muted">同步间隔</span>
                <input type="number" min={10} step={5} value={syncIntervalMinutes} onChange={(event) => setSyncIntervalMinutes(Math.max(0, Number(event.target.value)))} className="control h-9 w-24 px-3 text-sm" />
                <span className="text-xs muted">分钟</span>
              </div>
              {invalidInterval && <p className="mt-3 text-xs" style={{ color: 'var(--danger)' }}>轮询间隔不能低于 10 分钟</p>}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t divider flex items-center justify-between gap-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{syncEnabled ? syncMode === 'schedule' ? `每日 ${sortTimes(cleanTimes(syncTimes)).join('、') || '未设置时间'} 执行` : `每 ${syncIntervalMinutes} 分钟执行一次` : '自动同步已关闭'}</p>
          <button onClick={save} disabled={saveDisabled} className="btn-primary h-9 px-4">{saving ? '保存中…' : saved ? '已保存' : '保存设置'}</button>
        </div>
      </SettingSection>
      )}

      <SettingSection icon={<Database />} title="数据说明" description="组织雷达的数据范围与历史保留策略">
        <dl className="divide-y text-xs" style={{ borderColor: 'var(--border)' }}>
          <InfoRow label="数据来源" value="钉钉通讯录中的真实部门及成员" />
          <InfoRow label="统计范围" value="不扫描钉钉根目录人员，不包含未分配部门人员" />
          <InfoRow label="快照策略" value="有变化时保留完整快照，无变化时每天保留一张检查点" />
          <InfoRow label="历史清理" value="48 小时全量、30 天按日、一年内按月保留" />
          <InfoRow label="用途说明" value="数据仅用于内部组织观察与趋势参考" />
        </dl>
      </SettingSection>
    </div>
  );
}

function SettingSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="surface overflow-hidden">
      <div className="px-5 py-4 border-b divider flex items-start gap-3">
        <div className="w-8 h-8 rounded-md flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4" style={{ background: 'var(--surface-subtle)', color: 'var(--text-sub)' }}>{icon}</div>
        <div><h2 className="section-title">{title}</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p></div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) { return <div className="py-3 grid grid-cols-[100px_1fr] gap-4"><dt style={{ color: 'var(--text-muted)' }}>{label}</dt><dd className="muted">{value}</dd></div>; }
function padTimes(times: string[]) { return [...times.filter(Boolean), '', '', '', '', ''].slice(0, 5); }
function cleanTimes(times: string[]) { return times.filter(Boolean).slice(0, 5); }
function sortTimes(times: string[]) { return [...times].sort((a, b) => a.localeCompare(b)); }
function duplicateTimes(times: string[]) { const seen = new Set<string>(), duplicates = new Set<string>(); for (const time of times.filter(Boolean)) { if (seen.has(time)) duplicates.add(time); seen.add(time); } return [...duplicates]; }
