import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { CategorySlice } from '@/services/selectors';
import { formatBytes } from '@/lib/format';
import { CATEGORY_COLOR } from '../Badges';

export interface StorageChartProps {
  slices: CategorySlice[];
  centerLabel: string;
  centerSub: string;
  size?: number;
}

/** Donut chart + centre label. Colours are never the only cue: see the legend list beside it. */
export function StorageChart({ slices, centerLabel, centerSub, size = 168 }: StorageChartProps) {
  const total = slices.reduce((s, x) => s + x.bytes, 0);
  const data = slices.length > 0 ? slices : [{ category: 'General' as const, bytes: 1, count: 0, percent: 100 }];
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Storage by category: ${slices.map((s) => `${s.category} ${formatBytes(s.bytes)}`).join(', ') || 'empty'} — total ${formatBytes(total)}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="bytes" nameKey="category" innerRadius="68%" outerRadius="94%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
            {data.map((s) => (
              <Cell key={s.category} fill={slices.length > 0 ? CATEGORY_COLOR[s.category] : 'rgb(var(--surface3))'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="tnum text-[22px] font-semibold leading-none text-fg">{centerLabel}</span>
        <span className="mt-1 text-xs text-fg2">{centerSub}</span>
      </div>
    </div>
  );
}

/** Small ring gauge (e.g. "78% archived", queue health). */
export function RingGauge({ value, size = 84, label }: { value: number; size?: number; label?: string }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(value)} percent`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: 'rgb(var(--surface3))' }} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)} style={{ stroke: 'rgb(var(--accent))' }} />
      </svg>
      <span className="tnum absolute inset-0 flex items-center justify-center text-lg font-semibold text-fg">{Math.round(value)}%</span>
    </div>
  );
}
