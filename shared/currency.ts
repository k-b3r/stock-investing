export function toPhp(value: number | null, currency: string, usdToPhpRate: number | null): number | null {
  if (value === null) return null;
  if (currency === 'PHP') return value;
  if (currency === 'USD') return usdToPhpRate === null ? null : value * usdToPhpRate;
  return null;
}
