'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import type { SearchResult } from '@/service/search';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debouncedQuery = useDebounce(query, 300);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: SearchResult[]) => {
        setResults(data);
        setOpen(data.length > 0);
        setActiveIdx(-1);
      })
      .catch(() => {
        setResults([]);
        setOpen(false);
      });
  }, [debouncedQuery]);

  const navigate = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery('');
      router.push(`/stock/${result.ticker}`);
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      navigate(results[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <Input
        type="search"
        placeholder="Search PSEi companies (e.g. BDO, ALI)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg max-h-72 overflow-y-auto"
        >
          {results.map((r, i) => (
            <li
              key={r.ticker}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={() => navigate(r)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm transition-colors ${
                i === activeIdx ? 'bg-accent' : 'hover:bg-muted'
              }`}
            >
              <span className="font-mono font-semibold text-xs bg-muted px-1.5 py-0.5 rounded">
                {r.ticker}
              </span>
              <span className="text-muted-foreground truncate">{r.companyName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
