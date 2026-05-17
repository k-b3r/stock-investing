'use client';

import { cn } from '@/lib/utils';
import { classifyMetric } from '@/service/thresholds';
import type { MetricCategory, YearDataPoint } from '@/lib/types/financials';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const colorMap = {
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  red: 'bg-red-50 text-red-700',
  neutral: '',
};

export interface MetricRow {
  label: string;
  data: YearDataPoint[];
  category?: MetricCategory;
  format?: (v: number) => string;
  tooltip?: string;
}

function Cell({
  value,
  category,
  format,
  tooltip,
}: {
  value: number | null;
  category?: MetricCategory;
  format?: (v: number) => string;
  tooltip?: string;
}) {
  const threshold = category && value !== null ? classifyMetric(category, value) : 'neutral';
  const color = colorMap[threshold];
  const display = value === null ? 'N/A' : (format ? format(value) : value.toFixed(1) + '%');

  const cell = (
    <td
      className={cn(
        'px-3 py-1.5 text-right text-xs font-mono tabular-nums rounded',
        color,
        value === null && 'text-muted-foreground'
      )}
    >
      {display}
    </td>
  );

  if (tooltip && value === null) {
    return (
      <td className="px-3 py-1.5 text-right text-xs font-mono text-muted-foreground">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>N/A</TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
    );
  }

  return cell;
}

interface Props {
  rows: MetricRow[];
}

export function MetricTable({ rows }: Props) {
  // Collect ordered unique years from all rows
  const yearSet = new Set<string>();
  rows.forEach((r) => r.data.forEach((d) => yearSet.add(d.year)));
  const years = Array.from(yearSet).sort();

  // Build lookup: row label → year → value
  const lookup = new Map<string, Map<string, number | null>>();
  rows.forEach((r) => {
    const map = new Map<string, number | null>();
    r.data.forEach((d) => map.set(d.year, d.value));
    lookup.set(r.label, map);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4 text-left text-xs text-muted-foreground font-medium w-40">
              Metric
            </th>
            {years.map((y) => (
              <th key={y} className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <tr key={row.label} className="hover:bg-muted/30 transition-colors">
              <td className="py-1.5 pr-4 text-xs text-muted-foreground font-medium">{row.label}</td>
              {years.map((y) => {
                const val = lookup.get(row.label)?.get(y) ?? null;
                return (
                  <Cell
                    key={y}
                    value={val}
                    category={row.category}
                    format={row.format}
                    tooltip={row.tooltip}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
