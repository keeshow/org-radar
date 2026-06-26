import { useState } from 'react';
import changelog from '../changelog.json';
import { X } from 'lucide-react';

export default function VersionInfo() {
  const [open, setOpen] = useState(false);
  const latest = changelog[0];

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen(true)}
        className="text-xs transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        版本：{latest.version}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 dark:bg-black/50" onClick={() => setOpen(false)} />
          <div className="surface relative w-80 overflow-hidden text-left">
            <div className="px-5 py-3 border-b divider flex items-center justify-between">
              <h4 className="section-title">更新日志</h4>
              <button onClick={() => setOpen(false)} className="p-0.5 rounded-lg hover-surface" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {changelog.map((entry) => (
                <div key={entry.version}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="status-pill status-primary font-bold">
                      v{entry.version}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{entry.date}</span>
                  </div>
                  <p className="text-xs muted">{entry.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
