'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { InvestmentThesis } from '@/storage/investment-thesis';

interface Props {
  thesis: InvestmentThesis | null;
}

const verdictColor: Record<'buy' | 'watch' | 'pass', string> = {
  buy: 'text-green-600 bg-green-50',
  watch: 'text-yellow-600 bg-yellow-50',
  pass: 'text-red-600 bg-red-50',
};

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmt(value: number | null): string {
  return value === null ? 'N/A' : `₱${value.toFixed(2)}`;
}

function KeyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function InvestmentThesisCard({ thesis }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!thesis) return null;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Investment Thesis · {formatDate(thesis.generatedAt)}
          </p>
          {thesis.verdict && (
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded uppercase', verdictColor[thesis.verdict])}>
              {thesis.verdict}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyFigure label="Current Price" value={fmt(thesis.lastPrice)} />
          <KeyFigure label="Sticker Price" value={fmt(thesis.stickerPrice)} />
          <KeyFigure label="MOS Buy Price" value={fmt(thesis.mosPrice)} />
          <KeyFigure label="P/E" value={thesis.pe === null ? 'N/A' : `${thesis.pe.toFixed(1)}x`} />
        </div>

        {thesis.highlights.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {thesis.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Full Analysis</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{thesis.thesis}</p>
        )}
      </CardContent>
    </Card>
  );
}
