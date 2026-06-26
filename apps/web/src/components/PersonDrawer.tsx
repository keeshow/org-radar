import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, Clock3, Hash, History, Mail, Phone, UserRound, X } from 'lucide-react';
import { api } from '../api';
import type { PersonDetail } from '../types';

const eventTone: Record<string, string> = {
  person_added: 'status-success',
  person_removed: 'status-danger',
  department_changed: 'status-primary',
  title_changed: 'status-warning',
  profile_updated: 'status-neutral',
};

const eventLabel: Record<string, string> = {
  person_added: '新增',
  person_removed: '离职',
  department_changed: '部门变化',
  title_changed: '职位变化',
  profile_updated: '资料更新',
};

export default function PersonDrawer({ userId, onClose, mode = 'drawer' }: { userId: string; onClose: () => void; mode?: 'drawer' | 'panel' }) {
  const [data, setData] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getPerson(userId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [userId]);

  const content = (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface)' }}>
      <div className="h-14 px-4 flex items-center justify-between border-b divider shrink-0">
        <div>
          <h2 className="section-title">人员档案</h2>
        </div>
        <button onClick={onClose} className="hover-surface w-8 h-8 inline-flex items-center justify-center rounded-md" style={{ color: 'var(--text-muted)' }} aria-label="关闭人员详情">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-52 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在读取人员档案…</div>
        ) : error || !data ? (
          <div className="h-52 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>{error || '未找到该人员'}</div>
        ) : (
          <div>
            <div className="px-5 py-6 text-center border-b divider">
              <div className="w-16 h-16 mx-auto rounded-full border flex items-center justify-center text-xl font-semibold" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)', color: 'var(--primary)' }}>
                {data.name.charAt(0)}
              </div>
              <h3 className="mt-3 text-lg font-semibold" style={{ color: 'var(--text-main)' }}>{data.name}</h3>
              <p className="mt-0.5 text-sm muted">{data.title || '暂无职位信息'}</p>
              <span className={`status-pill mt-2 ${data.status === 'present' ? 'status-success' : 'status-danger'}`}>
                {data.status === 'present' ? '在职' : '已离职'}
              </span>
            </div>

            <ProfileSection title="组织信息" icon={<Building2 />}>
              <div className="space-y-1.5">
                {data.departments.length > 0 ? data.departments.map((department) => (
                  <div key={department.deptId} className="px-3 py-2 rounded-md text-xs leading-5 muted" style={{ background: 'var(--surface-subtle)' }}>{department.deptPath}</div>
                )) : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>未关联部门</p>}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
                <Field label="工号" value={data.employeeNo} />
                <Field label="公司" value={data.corpName} />
                <Field label="直属主管" value={data.managerName} />
                <Field label="管理角色" value={data.isAdmin ? '管理员' : data.hasSubordinate ? '团队负责人' : ''} />
              </div>
            </ProfileSection>

            <ProfileSection title="联系方式" icon={<Mail />}>
              <div className="space-y-3">
                <ContactLine icon={<Phone />} label="手机" value={data.mobileMasked || '未记录'} />
                <ContactLine icon={<Mail />} label="邮箱" value={data.emailMasked || '未记录'} />
              </div>
            </ProfileSection>

            <ProfileSection title="系统记录" icon={<Clock3 />}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="首次记录" value={formatDate(data.firstSeenAt)} />
                <Field label="最近出现" value={formatDate(data.lastSeenAt)} />
                <div className="col-span-2"><Field label="User ID" value={data.userId} mono /></div>
              </div>
            </ProfileSection>

            {data.labels.length > 0 && (
              <ProfileSection title="标签与角色" icon={<Hash />}>
                <div className="flex flex-wrap gap-1.5">
                  {data.labels.map((label, index) => {
                    const text = typeof label === 'string' ? label : label.name || '';
                    return text ? <span key={`${text}-${index}`} className="px-2 py-1 rounded-md text-[11px] muted" style={{ background: 'var(--surface-subtle)' }}>{text}</span> : null;
                  })}
                </div>
              </ProfileSection>
            )}

            <ProfileSection title="个人变化日志" icon={<History />} last>
              {data.changes.length === 0 ? (
                <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>统计开始以来暂无个人变化</p>
              ) : (
                <div className="space-y-0">
                  {data.changes.map((change, index) => (
                    <div key={change.id} className="relative pl-5 pb-4 last:pb-0">
                      <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full" style={{ background: 'var(--text-muted)' }} />
                      {index < data.changes.length - 1 && <span className="absolute left-[3px] top-4 bottom-0 w-px" style={{ background: 'var(--border)' }} />}
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${eventTone[change.type] || eventTone.profile_updated}`}>{eventLabel[change.type] || '变化'}</span>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatDate(change.detectedAt)}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 muted">{change.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </ProfileSection>
          </div>
        )}
      </div>
    </div>
  );

  if (mode === 'panel') return <aside className="surface h-full overflow-hidden">{content}</aside>;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1px]" onClick={onClose} aria-label="关闭遮罩" />
      <div className="relative w-full max-w-md h-full shadow-2xl">{content}</div>
    </div>
  );
}

function ProfileSection({ title, icon, children, last = false }: { title: string; icon: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <section className={`px-5 py-5 ${last ? '' : 'border-b divider'}`}>
      <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase [&_svg]:w-3.5 [&_svg]:h-3.5" style={{ color: 'var(--text-muted)' }}>{icon}{title}</div>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return <div><p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p><p className={`mt-0.5 text-xs truncate ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-main)' }}>{value}</p></div>;
}

function ContactLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 text-xs"><span className="[&_svg]:w-3.5 [&_svg]:h-3.5" style={{ color: 'var(--text-muted)' }}>{icon}</span><span className="w-10" style={{ color: 'var(--text-muted)' }}>{label}</span><span style={{ color: 'var(--text-main)' }}>{value}</span></div>;
}

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无';
}
