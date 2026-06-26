import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

type RadarDot = {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
};

function createDots(seed: number): RadarDot[] {
  let state = seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  return Array.from({ length: 14 }, (_, id) => {
    const radius = 18 + random() * 36;
    const angle = random() * Math.PI * 2;
    return {
      id,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      size: 3 + random() * 3,
      delay: random() * 5.6,
    };
  });
}

interface SyncRadarBackdropProps {
  forceActive?: boolean;
  variant?: 'app' | 'auth';
  affectPanels?: boolean;
}

export default function SyncRadarBackdrop({ forceActive = false, variant = 'app', affectPanels = true }: SyncRadarBackdropProps) {
  const [syncActive, setSyncActive] = useState(forceActive);
  const [seed, setSeed] = useState(Date.now());
  const active = forceActive || syncActive;

  useEffect(() => {
    if (forceActive) return;

    let mounted = true;

    const load = async () => {
      try {
        const status = await api.getSyncStatus();
        if (!mounted) return;
        const running = status.status === 'running';
        setSyncActive((current) => {
          if (!current && running) setSeed(Date.now());
          return running;
        });
      } catch {
        if (mounted) setSyncActive(false);
      }
    };

    const onSyncStarted = () => {
      setSeed(Date.now());
      setSyncActive(true);
      load();
    };

    load();
    window.addEventListener('organization-sync-started', onSyncStarted);
    const timer = window.setInterval(load, active ? 2200 : 9000);

    return () => {
      mounted = false;
      window.removeEventListener('organization-sync-started', onSyncStarted);
      window.clearInterval(timer);
    };
  }, [active, forceActive]);

  useEffect(() => {
    if (!affectPanels) return;
    document.documentElement.classList.toggle('sync-scanning', active);
    return () => document.documentElement.classList.remove('sync-scanning');
  }, [active, affectPanels]);

  const dots = useMemo(() => createDots(seed), [seed]);

  return (
    <div className={`sync-radar-backdrop sync-radar-backdrop-${variant} ${active ? 'is-active' : ''}`} aria-hidden="true">
      <div className="sync-radar-field">
        <div className="sync-radar-grid" />
        <div className="sync-radar-sweep" />
        <div className="sync-radar-core" />
        {dots.map((dot) => (
          <span
            key={dot.id}
            className="sync-radar-dot"
            style={{
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              animationDelay: `${dot.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
