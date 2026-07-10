'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface ScreenerRow {
  ticker: string;
  roic: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  niGrowth: number | null;
  fcfGrowth: number | null;
  bvGrowth: number | null;
  dpsGrowth: number | null;
  debtEquity: number | null;
  score: number; // count of Big Five metrics >= 10%
}

type Col = keyof Omit<ScreenerRow, 'ticker'>;

const COLS: { key: Col; label: string; unit: string }[] = [
  { key: 'score',         label: '★ Score',        unit: ''  },
  { key: 'roic',          label: 'ROIC',            unit: '%' },
  { key: 'epsGrowth',     label: 'EPS Growth',      unit: '%' },
  { key: 'revenueGrowth', label: 'Rev Growth',      unit: '%' },
  { key: 'niGrowth',      label: 'NI Growth',       unit: '%' },
  { key: 'fcfGrowth',     label: 'FCF Growth',      unit: '%' },
  { key: 'bvGrowth',      label: 'BV Growth',       unit: '%' },
  { key: 'dpsGrowth',     label: 'DPS Growth',      unit: '%' },
  { key: 'debtEquity',    label: 'D/E',             unit: 'x' },
];

function cell(value: number | null, unit: string, col: Col) {
  if (value === null) return { display: 'N/A', color: 'text-muted-foreground' };
  const display = `${value.toFixed(1)}${unit}`;
  if (col === 'score') return { display: String(value), color: value >= 4 ? 'text-green-600 font-bold' : value >= 2 ? 'text-yellow-600' : 'text-red-600' };
  if (col === 'debtEquity') return { display, color: value <= 0.5 ? 'text-green-600' : value <= 1.0 ? 'text-yellow-600' : 'text-red-600' };
  return { display, color: value >= 10 ? 'text-green-600' : value >= 5 ? 'text-yellow-600' : 'text-red-600' };
}

interface Props {
  rows: ScreenerRow[];
}

export function ScreenerTable({ rows }: Props) {
  const [sortCol, setSortCol] = useState<Col>('score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  function handleSort(col: Col) {
    if (col === sortCol) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir(col === 'debtEquity' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'desc' ? -Infinity : Infinity);
      const bv = b[sortCol] ?? (sortDir === 'desc' ? -Infinity : Infinity);
      return sortDir === 'desc' ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [rows, sortCol, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-6 text-left text-xs text-muted-foreground font-medium w-24">Ticker</th>
            {COLS.map(c => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={cn(
                  'px-3 py-2 text-right text-xs font-medium cursor-pointer select-none whitespace-nowrap',
                  sortCol === c.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c.label}
                {sortCol === c.key && (
                  <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {sorted.map(row => (
            <tr key={row.ticker} className="hover:bg-muted/30 transition-colors">
              <td className="py-2 pr-6">
                <Link
                  href={`/stock/${row.ticker}`}
                  className="font-mono font-semibold text-sm hover:underline"
                >
                  {row.ticker}
                </Link>
              </td>
              {COLS.map(c => {
                const { display, color } = cell(row[c.key] as number | null, c.unit, c.key);
                return (
                  <td key={c.key} className={cn('px-3 py-2 text-right font-mono text-xs tabular-nums', color)}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
