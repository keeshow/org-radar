import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { api } from '../api';
import SyncRadarBackdrop from './SyncRadarBackdrop';
import { useAppConfig } from './AppConfigProvider';

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const appConfig = useAppConfig();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!appConfig.accessControlEnabled) {
      setAuthenticated(true);
      setChecking(false);
      return;
    }

    api.getAuthStatus()
      .then((status) => setAuthenticated(status.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, [appConfig.accessControlEnabled]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      await api.verifyAccessCode(code.trim());
      setAuthenticated(true);
      setCode('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes('权限码') || message.includes('401')
        ? '权限码不正确，请重新输入'
        : '暂时无法完成验证，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-300">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (authenticated) return <>{children}</>;

  return (
    <div className="auth-screen min-h-screen relative overflow-hidden text-white">
      <SyncRadarBackdrop forceActive variant="auth" affectPanels={false} />
      <div className="auth-screen-vignette" />

      <main className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <form
          onSubmit={submit}
          className="auth-card w-full max-w-sm rounded-2xl p-6"
        >
          <div className="flex items-start gap-3 mb-7">
            <div className="auth-icon w-10 h-10 shrink-0 rounded-xl flex items-center justify-center">
              <LockKeyhole className="w-5 h-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="auth-title text-lg font-semibold" title={appConfig.appName}>{appConfig.appName}</h1>
            </div>
          </div>

          <label className="auth-label block text-xs font-medium mb-2" htmlFor="access-code">
            请输入权限码进入系统
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={code}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'access-code-error' : undefined}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError('');
            }}
            className={`auth-input w-full h-11 rounded-xl border px-3 text-sm outline-none transition duration-150 ${
              error
                ? 'is-error'
                : ''
            }`}
          />

          <div className="min-h-5 pt-1.5">
            {error && <p id="access-code-error" role="alert" className="auth-error text-xs">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="auth-submit mt-3 w-full h-12 rounded-xl font-semibold"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            验证进入
          </button>
        </form>
      </main>
    </div>
  );
}
