import { describe, it, expect } from 'vitest';
import { computeStickerPrice } from './valuation';

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
});
