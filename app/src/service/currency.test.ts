import { describe, it, expect } from 'vitest';
import { toPhp } from './currency';

describe('toPhp', () => {
  it('returns the value unchanged when currency is PHP', () => {
    expect(toPhp(100, 'PHP', 58.5)).toBe(100);
  });

  it('returns the value unchanged when currency is PHP even if fxRate is null', () => {
    expect(toPhp(100, 'PHP', null)).toBe(100);
  });

  it('converts USD to PHP using the given rate', () => {
    expect(toPhp(10, 'USD', 58.5)).toBeCloseTo(585, 6);
  });

  it('returns null when currency is USD but fxRate is null (no silent wrong conversion)', () => {
    expect(toPhp(10, 'USD', null)).toBeNull();
  });

  it('returns null for an unrecognized currency, even with a rate available', () => {
    expect(toPhp(10, 'EUR', 58.5)).toBeNull();
  });

  it('returns null when value is null, regardless of currency', () => {
    expect(toPhp(null, 'PHP', 58.5)).toBeNull();
    expect(toPhp(null, 'USD', 58.5)).toBeNull();
  });
});
