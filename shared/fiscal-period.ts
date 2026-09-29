// Morningstar period labels: annual rows are "2024-12" or "2024"; others are "TTM", "Last Quarter", etc.
export function isAnnualYM(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

export function isAnnualYear(s: string): boolean {
  return /^\d{4}$/.test(s);
}
