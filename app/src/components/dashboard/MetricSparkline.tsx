'use client';

import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';
import type { YearDataPoint } from '@/lib/types/financials';

interface Props {
  data: YearDataPoint[];
}

export function MetricSparkline({ data }: Props) {
  const chartData = data.map((d) => ({ year: d.year, value: d.value }));

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: '2px 6px' }}
          formatter={(v) => [v != null ? Number(v).toFixed(1) + '%' : 'N/A', '']}
          labelFormatter={(l) => l}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
