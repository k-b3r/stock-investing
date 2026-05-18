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

export default function MetricSparkline({ data, unit = '%', years = 10 }: Props) {
  const chartData = data.slice(-years).map((d) => ({ year: d.year, value: d.value }));
  const hasData = chartData.some((d) => d.value !== null);
  if (!hasData) return <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground">No data</div>;

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
          tickFormatter={(v) => `${Number(v).toFixed(0)}${unit}`}
          width={36}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid hsl(var(--border))',
          }}
          formatter={(v) => [v != null ? `${Number(v).toFixed(1)}${unit}` : 'N/A', '']}
          labelFormatter={(l) => l}
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
