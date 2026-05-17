'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import type { ThresholdResult, YearDataPoint } from '@/lib/types/financials';
import { cn } from '@/lib/utils';

const MetricSparkline = dynamic(
  () => import('./MetricSparkline').then((m) => m.MetricSparkline),
  { ssr: false }
);

const colorMap: Record<ThresholdResult, string> = {
  green: 'text-green-600 bg-green-50',
  yellow: 'text-yellow-600 bg-yellow-50',
  red: 'text-red-600 bg-red-50',
  neutral: 'text-muted-foreground bg-muted',
};

interface Props {
  label: string;
  value: number | null;
  threshold: ThresholdResult;
  sparkData: YearDataPoint[];
  unit?: string;
}

export function MetricCard({ label, value, threshold, sparkData, unit = '%' }: Props) {
  const displayValue = value === null ? 'N/A' : `${value.toFixed(1)}${unit}`;

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className={cn('text-lg font-bold px-1.5 py-0.5 rounded inline-block', colorMap[threshold])}>
          {displayValue}
        </p>
        <MetricSparkline data={sparkData} unit={unit} />
      </CardContent>
    </Card>
  );
}
