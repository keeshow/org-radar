import { NavLink, useLocation } from 'react-router-dom';
import { Activity, FileText, Users, Radar, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import VersionInfo from './VersionInfo';
import { useAppConfig } from './AppConfigProvider';

const navItems = [
  { to: '/', label: '情报总览', icon: Radar },
  { to: '/contacts', label: '组织通讯录', icon: Users },
  { to: '/department-health', label: '部门健康', icon: Activity },
  { to: '/changes', label: '变化记录', icon: RefreshCw },
  { to: '/reports', label: '组织报告', icon: FileText },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

export default function Navbar() {
  const location = useLocation();
  const appConfig = useAppConfig();
  const active = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r text-slate-300" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
        <div className="h-16 px-5 flex items-center border-b border-white/10">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mr-3" style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary-border)' }}>
            <Radar className="w-4 h-4" style={{ color: 'var(--primary)' }} />
          </div>
          <div className="min-w-0">
            <p className="sidebar-brand-title text-sm font-semibold text-slate-50" title={appConfig.appName}>{appConfig.appName}</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          <p className="px-3 mb-2 text-[10px] font-medium uppercase text-slate-500">工作台</p>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={`h-10 px-3 flex items-center gap-3 rounded-md text-sm transition-colors ${active(to)
                ? 'text-slate-50'
                : 'text-slate-500 hover:text-slate-300'}`}
              style={active(to) ? { background: 'var(--sidebar-active)' } : undefined}
              onMouseEnter={(event) => { if (!active(to)) event.currentTarget.style.background = 'var(--sidebar-hover)'; }}
              onMouseLeave={(event) => { if (!active(to)) event.currentTarget.style.background = 'transparent'; }}
            >
              <Icon className="w-4 h-4" style={{ color: active(to) ? 'var(--primary)' : '#64748b' }} />
              <span>{label}</span>
              {active(to) && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-white/10 text-[11px] text-slate-600">
          <div className="mt-1"><VersionInfo /></div>
        </div>
      </aside>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 h-16 border-t backdrop-blur-xl flex items-center justify-around px-1" style={{ background: 'color-mix(in srgb, var(--surface) 94%, transparent)', borderColor: 'var(--border)' }}>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={`min-w-0 flex-1 h-full flex flex-col items-center justify-center gap-1 text-[10px] ${active(to) ? 'link-primary' : 'text-slate-400'}`}>
            <Icon className="w-4 h-4" />
            <span className="truncate max-w-full">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
