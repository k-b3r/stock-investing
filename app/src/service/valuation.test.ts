import { describe, it, expect } from 'vitest';
import { computeStickerPrice, computeFuturePeCap } from './valuation';

describe('computeStickerPrice', () => {
  it('returns null when eps is null', () => {
    expect(computeStickerPrice(null, 12)).toBeNull();
  });

  it('returns null when eps is zero or negative', () => {
    expect(computeStickerPrice(0, 12)).toBeNull();
    expect(computeStickerPrice(-5, 12)).toBeNull();
  });

  it('returns null when growthRatePct is null', () => {
    expect(computeStickerPrice(10, null)).toBeNull();
  });

  it('returns null when growthRatePct is zero or negative', () => {
    expect(computeStickerPrice(10, 0)).toBeNull();
    expect(computeStickerPrice(10, -3)).toBeNull();
  });

  it('computes sticker price and MOS for a normal case (eps=10, growth=12%)', () => {
    // cappedGrowth = 0.12 (under 15% cap)
    // futurePE = min(0.12 * 100 * 2, 20) = min(24, 20) = 20
    // futureEps = 10 * (1.12 ** 10) = 31.058...
    // futureValue = 31.058... * 20 = 621.17...
    // stickerPrice = 621.17... / (1.15 ** 10) = 621.17... / 4.0456... = 153.57...
    // mosPrice = stickerPrice * 0.5
    const result = computeStickerPrice(10, 12);
    expect(result).not.toBeNull();
    expect(result!.stickerPrice).toBeCloseTo(153.57, 1);
    expect(result!.mosPrice).toBeCloseTo(76.78, 1);
  });

  it('caps growth rate at 15% even when input is higher', () => {
    // growth=30 and growth=15 must produce identical output since both cap to 15%
    const atCap = computeStickerPrice(10, 15);
    const aboveCap = computeStickerPrice(10, 30);
    expect(aboveCap!.stickerPrice).toBeCloseTo(atCap!.stickerPrice, 6);
    expect(aboveCap!.mosPrice).toBeCloseTo(atCap!.mosPrice, 6);
  });

  it('caps future P/E at 20 even when 2x growth rate would exceed it', () => {
    // growth=15 -> 2*15=30, capped to 20 -> futurePE must be 20, not 30
    // futureEps = 10 * (1.15 ** 10) = 40.4556...
    // if futurePE were uncapped (30): futureValue = 1213.67..., stickerPrice = 300.05...
    // with cap (20): futureValue = 809.11..., stickerPrice = 200.03...
    const result = computeStickerPrice(10, 15);
    expect(result!.stickerPrice).toBeCloseTo(200.03, 1);
  });

  it('mosPrice is always exactly half of stickerPrice', () => {
    const result = computeStickerPrice(7.5, 9);
    expect(result!.mosPrice).toBeCloseTo(result!.stickerPrice * 0.5, 10);
  });

  it('exposes the intermediate breakdown values used to reach stickerPrice (eps=10, growth=12%)', () => {
    // cappedGrowthPct = 12 (under 15% cap)
    // futurePE = min(12 * 2, 20) = 20
    // futureEps = 10 * (1.12 ** 10) = 31.058...
    const result = computeStickerPrice(10, 12);
    expect(result!.cappedGrowthPct).toBeCloseTo(12, 6);
    expect(result!.futurePE).toBeCloseTo(20, 6);
    expect(result!.futureEps).toBeCloseTo(31.06, 1);
  });

  it('breakdown values respect the same 15% growth cap and 20 P/E cap as stickerPrice', () => {
    const result = computeStickerPrice(10, 30);
    expect(result!.cappedGrowthPct).toBeCloseTo(15, 6);
    expect(result!.futurePE).toBeCloseTo(20, 6);
  });

  it('uses the default futurePeCap of 20 when the 3rd argument is omitted', () => {
    const result = computeStickerPrice(10, 12);
    expect(result!.futurePE).toBeCloseTo(20, 6);
  });

  it('uses a custom futurePeCap when provided, instead of the default 20', () => {
    // growth=12 -> 2*12=24, would cap to 20 by default, but with futurePeCap=15 it caps to 15
    const result = computeStickerPrice(10, 12, 15);
    expect(result!.futurePE).toBeCloseTo(15, 6);
  });
});

describe('computeFuturePeCap', () => {
  it('returns 20 when high52w is null', () => {
    expect(computeFuturePeCap(null, 10)).toBe(20);
  });

  it('returns 20 when eps is null', () => {
    expect(computeFuturePeCap(150, null)).toBe(20);
  });

  it('returns 20 when eps is zero or negative', () => {
    expect(computeFuturePeCap(150, 0)).toBe(20);
    expect(computeFuturePeCap(150, -5)).toBe(20);
  });

  it('computes high52w / eps for a normal case', () => {
    expect(computeFuturePeCap(150, 10)).toBeCloseTo(15, 6);
  });

  it('returns 20 when the computed cap would be zero or negative', () => {
    expect(computeFuturePeCap(-10, 5)).toBe(20);
    expect(computeFuturePeCap(0, 5)).toBe(20);
  });
});
