'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { YearDataPoint } from '@/lib/types/financials';

interface Props {
  data: YearDataPoint[];
  unit?: string;
  years?: number;
}

function smartFormat(v: number, unit: string): string {
  const abs = Math.abs(v);
  const decimals = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
  return `${v.toFixed(decimals)}${unit}`;
}

export default function MetricSparkline({ data, unit = '%', years = 10 }: Props) {
  const chartData = data.slice(-years).map((d) => ({ year: d.year, value: d.value }));
  const hasData = chartData.some((d) => d.value !== null);
  if (!hasData) return (
    <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground">
      No data
    </div>
  );

  const nonNull = chartData.filter((d) => d.value !== null).map((d) => d.value as number);
  const maxAbs = Math.max(...nonNull.map(Math.abs));
  const axisDecimals = maxAbs >= 10 ? 0 : maxAbs >= 1 ? 1 : 2;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-45}
          textAnchor="end"
          height={36}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${Number(v).toFixed(axisDecimals)}${unit}`}
          width={40}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid hsl(var(--border))',
            backgroundColor: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
          }}
          formatter={(v) => [v != null ? smartFormat(Number(v), unit) : 'N/A', '']}
          labelFormatter={(l) => String(l)}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={2}
          dot={{ r: 2, fill: 'currentColor' }}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
