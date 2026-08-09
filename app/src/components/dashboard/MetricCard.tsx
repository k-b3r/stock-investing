'use client';

import dynamic from 'next/dynamic';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ThresholdResult, YearDataPoint } from '@/lib/types/financials';
import { cn } from '@/lib/utils';

const MetricSparkline = dynamic(() => import('./MetricSparkline'), {
  ssr: false,
  loading: () => <div className="h-[140px]" />,
});

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
  sparkUnit?: string;
  years?: number;
  tooltip?: string;
}

export function MetricCard({ label, value, threshold, sparkData, unit = '%', sparkUnit, years = 10, tooltip }: Props) {
  const displayValue = value === null ? 'N/A' : `${value.toFixed(1)}${unit}`;

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className={cn('text-lg font-bold px-1.5 py-0.5 rounded inline-block', colorMap[threshold])}>
          {displayValue}
        </p>
        <MetricSparkline data={sparkData} unit={sparkUnit ?? unit} years={years} />
      </CardContent>
    </Card>
  );
}
