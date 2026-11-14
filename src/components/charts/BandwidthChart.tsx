import { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SpeedSample } from '@/types';
import { MB } from '@/lib/format';

export interface BandwidthChartProps {
  samples: SpeedSample[];
  /** how many of the latest samples to show */
  window?: number;
  height?: number;
  showUpload?: boolean;
  showAxes?: boolean;
  maxHint?: number;
  /** MB/s */
  unit?: 'MB/s' | 'Mbps';
}

interface Row {
  t: number;
  label: string;
  down: number;
  up: number;
}

const tick = { fill: 'rgb(var(--fg3))', fontSize: 11 } as const;

export function BandwidthChart({ samples, window: win = 60, height = 120, showUpload = false, showAxes = true, maxHint = 60, unit = 'MB/s' }: BandwidthChartProps) {
  const gid = useId().replace(/:/g, '');
  const mult = unit === 'Mbps' ? 8 / MB : 1 / MB;
  const rows = useMemo<Row[]>(
    () =>
      samples.slice(-win).map((s) => ({
        t: s.t,
        label: new Date(s.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: win <= 90 ? '2-digit' : undefined }),
        down: +(s.down * mult).toFixed(2),
        up: +(s.up * mult).toFixed(2),
      })),
    [samples, win, mult],
  );

  return (
    <div style={{ height }} role="img" aria-label={`Network throughput over the last ${rows.length} seconds`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 4, left: showAxes ? -18 : 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`dl-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.38 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(var(--accent))', stopOpacity: 0.02 }} />
            </linearGradient>
            <linearGradient id={`ul-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'rgb(var(--accent2))', stopOpacity: 0.25 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(var(--accent2))', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 5" style={{ stroke: 'rgb(var(--line))' }} />
          {showAxes && <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={42} interval="preserveStartEnd" />}
          {showAxes && <YAxis tick={tick} tickLine={false} axisLine={false} width={44} domain={[0, (max: number) => Math.max(maxHint, Math.ceil(max / 10) * 10)]} />}
          <Tooltip
            cursor={{ style: { stroke: 'rgb(var(--fg3))', strokeDasharray: '3 3' } }}
            contentStyle={{ background: 'rgb(var(--surface3))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12, color: 'rgb(var(--fg))' }}
            labelStyle={{ color: 'rgb(var(--fg2))' }}
            formatter={(v: number, name: string) => [`${v.toFixed(1)} ${unit}`, name === 'down' ? 'Download' : 'Upload']}
          />
          <Area type="monotone" dataKey="down" style={{ stroke: 'rgb(var(--accent))' }} strokeWidth={2} fill={`url(#dl-${gid})`} isAnimationActive={false} dot={false} />
          {showUpload && <Area type="monotone" dataKey="up" style={{ stroke: 'rgb(var(--accent2))' }} strokeWidth={1.5} fill={`url(#ul-${gid})`} isAnimationActive={false} dot={false} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
