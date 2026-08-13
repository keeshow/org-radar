import { useId, useState } from 'react';

export interface SmoothTrendPoint {
  label: string;
  tooltipLabel?: string;
  value: number;
}

interface Marker {
  index: number;
  x: number;
  y: number;
  value: number;
  roles: string[];
  label: string;
}

interface SmoothTrendChartProps {
  points: SmoothTrendPoint[];
  maxPoints?: number;
  heightClassName?: string;
  emptyText?: string;
  ariaLabel?: string;
  compact?: boolean;
}

export default function SmoothTrendChart({
  points,
  maxPoints = 30,
  heightClassName = 'h-40',
  emptyText = '暂无趋势数据',
  ariaLabel = '人数趋势图',
  compact = false,
}: SmoothTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const rawId = useId();
  const gradientId = `smooth-trend-${rawId.replace(/:/g, '')}`;
  const visible = points.slice(-maxPoints).filter((point) => Number.isFinite(point.value));

  if (visible.length === 0) {
    return <div className={`${heightClassName} flex items-center justify-center text-sm`} style={{ color: 'var(--text-muted)' }}>{emptyText}</div>;
  }

  const min = Math.min(...visible.map((point) => point.value));
  const max = Math.max(...visible.map((point) => point.value));
  const range = Math.max(1, max - min);
  const left = compact ? 3 : 4;
  const right = compact ? 82 : 88;
  const top = compact ? 18 : 16;
  const bottom = compact ? 78 : 82;
  const coordinates = visible.map((point, index) => {
    const x = visible.length === 1 ? 50 : left + (index / (visible.length - 1)) * (right - left);
    const y = bottom - ((point.value - min) / range) * (bottom - top);
    return { x, y, value: point.value, label: point.label };
  });
  const path = smoothPath(coordinates);
  const area = `${path} L ${coordinates[coordinates.length - 1].x},${bottom} L ${coordinates[0].x},${bottom} Z`;
  const markers = buildMarkers(visible, coordinates);
  const current = markers.find((marker) => marker.index === visible.length - 1) || markers[markers.length - 1];
  const hovered = hoveredIndex === null ? null : coordinates[hoveredIndex];
  const hoveredPoint = hoveredIndex === null ? null : visible[hoveredIndex];
  const hoverTooltipAbove = hovered ? hovered.y > (compact ? 28 : 24) : true;
  const axisMarkers = markers.filter((marker) => marker.index === 0 || marker.index === visible.length - 1);

  return (
    <div>
      <div
        className={`relative ${heightClassName}`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * 100;
          const nearest = coordinates.reduce((best, point, index) => (
            Math.abs(point.x - x) < Math.abs(coordinates[best].x - x) ? index : best
          ), 0);
          setHoveredIndex(nearest);
        }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={compact ? '0.12' : '0.14'} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[top, (top + bottom) / 2, bottom].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="var(--border)" strokeWidth="0.35" />)}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth={compact ? '1.8' : '2'} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {markers.map((marker) => (
          <span
            key={marker.index}
            className="pointer-events-none absolute rounded-full"
            style={{
              left: `${marker.x}%`,
              top: `${marker.y}%`,
              width: compact ? '4px' : '5px',
              height: compact ? '4px' : '5px',
              background: 'var(--primary)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {hovered && (
          <span
            className="pointer-events-none absolute rounded-full border"
            style={{
              left: `${hovered.x}%`,
              top: `${hovered.y}%`,
              width: compact ? '7px' : '8px',
              height: compact ? '7px' : '8px',
              background: 'var(--surface)',
              borderColor: 'var(--primary)',
              boxShadow: '0 0 0 3px var(--primary-soft)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {current && hoveredIndex === null && (
          <div
            className={`pointer-events-none absolute rounded-md border shadow-sm ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
            style={{
              left: `${clamp(current.x + 1.6, 0, compact ? 84 : 90)}%`,
              top: `${clamp(current.y - (compact ? 6 : 5), 4, compact ? 72 : 76)}%`,
              background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
              borderColor: 'var(--primary-border)',
              color: 'var(--text-main)',
            }}
          >
            <span className="whitespace-nowrap">当前 {current.value} 人</span>
          </div>
        )}

        {hovered && hoveredPoint && (
          <div
            className={`pointer-events-none absolute rounded-md border shadow-sm ${compact ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1.5 text-[10px]'}`}
            style={{
              left: `${hovered.x}%`,
              top: `${hoverTooltipAbove ? hovered.y : hovered.y}%`,
              transform: `${hovered.x > 72 ? 'translateX(-100%)' : hovered.x < 18 ? 'translateX(0)' : 'translateX(-50%)'} translateY(${hoverTooltipAbove ? `calc(-100% - ${compact ? '14px' : '16px'})` : `${compact ? '14px' : '16px'}`})`,
              background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
              borderColor: 'var(--primary-border)',
              color: 'var(--text-main)',
            }}
          >
            <span className="block whitespace-nowrap">{hoveredPoint.tooltipLabel || hoveredPoint.label}</span>
            <span className="block whitespace-nowrap font-semibold">{hovered.value} 人</span>
          </div>
        )}
      </div>

      <div className="relative h-5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {axisMarkers.map((marker) => {
          const alignRight = marker.x > 72;
          const alignLeft = marker.x < 18;
          const translateX = alignLeft ? '0' : alignRight ? '-100%' : '-50%';
          return (
            <span
              key={`axis-${marker.index}`}
              className="absolute top-1 whitespace-nowrap"
              style={{ left: `${marker.x}%`, transform: `translateX(${translateX})` }}
            >
              {marker.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function buildMarkers(points: SmoothTrendPoint[], coordinates: Array<{ x: number; y: number; value: number; label: string }>): Marker[] {
  const firstIndex = 0;
  const currentIndex = points.length - 1;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const minIndex = points.findIndex((point) => point.value === minValue);
  const maxIndex = points.findIndex((point) => point.value === maxValue);
  const roles = new Map<number, string[]>();

  addRole(roles, firstIndex, '起始');
  addRole(roles, minIndex, '最低');
  addRole(roles, maxIndex, '最高');
  addRole(roles, currentIndex, '当前');

  return [...roles.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, labels]) => ({
      index,
      x: coordinates[index].x,
      y: coordinates[index].y,
      value: points[index].value,
      roles: labels,
      label: points[index].label,
    }));
}

function addRole(target: Map<number, string[]>, index: number, role: string) {
  const current = target.get(index) || [];
  if (!current.includes(role)) current.push(role);
  target.set(index, current);
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let path = `M ${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return path;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
