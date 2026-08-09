import { describe, it, expect } from 'vitest';
import { classifyMetric, classifyStickerPrice } from './thresholds';

describe('classifyMetric — growth', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('growth', null)).toBe('neutral');
  });
  it('returns green at exactly 10', () => {
    expect(classifyMetric('growth', 10)).toBe('green');
  });
  it('returns green above 10', () => {
    expect(classifyMetric('growth', 25)).toBe('green');
  });
  it('returns yellow at 9.99', () => {
    expect(classifyMetric('growth', 9.99)).toBe('yellow');
  });
  it('returns yellow at exactly 5', () => {
    expect(classifyMetric('growth', 5)).toBe('yellow');
  });
  it('returns red at 4.99', () => {
    expect(classifyMetric('growth', 4.99)).toBe('red');
  });
  it('returns red at 0', () => {
    expect(classifyMetric('growth', 0)).toBe('red');
  });
  it('returns red for negative values', () => {
    expect(classifyMetric('growth', -5)).toBe('red');
  });
});

describe('classifyMetric — roic', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('roic', null)).toBe('neutral');
  });
  it('returns green at exactly 10', () => {
    expect(classifyMetric('roic', 10)).toBe('green');
  });
  it('returns yellow at 9.99', () => {
    expect(classifyMetric('roic', 9.99)).toBe('yellow');
  });
  it('returns yellow at exactly 5', () => {
    expect(classifyMetric('roic', 5)).toBe('yellow');
  });
  it('returns red at 4.99', () => {
    expect(classifyMetric('roic', 4.99)).toBe('red');
  });
});

describe('classifyMetric — debtEquity', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('debtEquity', null)).toBe('neutral');
  });
  it('returns green at exactly 0.5', () => {
    expect(classifyMetric('debtEquity', 0.5)).toBe('green');
  });
  it('returns green at 0', () => {
    expect(classifyMetric('debtEquity', 0)).toBe('green');
  });
  it('returns yellow at 0.51', () => {
    expect(classifyMetric('debtEquity', 0.51)).toBe('yellow');
  });
  it('returns yellow at exactly 1.0', () => {
    expect(classifyMetric('debtEquity', 1.0)).toBe('yellow');
  });
  it('returns red at 1.01', () => {
    expect(classifyMetric('debtEquity', 1.01)).toBe('red');
  });
  it('returns red for very high debt', () => {
    expect(classifyMetric('debtEquity', 5)).toBe('red');
  });
});

describe('classifyStickerPrice', () => {
  it('returns neutral when lastPrice is null', () => {
    expect(classifyStickerPrice(null, 100, 50)).toBe('neutral');
  });

  it('returns neutral when stickerPrice is null', () => {
    expect(classifyStickerPrice(50, null, null)).toBe('neutral');
  });

  it('returns neutral when stickerPrice is zero', () => {
    expect(classifyStickerPrice(50, 0, 0)).toBe('neutral');
  });

  it('returns green when price is at exactly 50% of sticker (at MOS)', () => {
    expect(classifyStickerPrice(50, 100, 50)).toBe('green');
  });

  it('returns green when price is below 50% of sticker', () => {
    expect(classifyStickerPrice(30, 100, 50)).toBe('green');
  });

  it('returns yellow when price is between MOS and sticker', () => {
    expect(classifyStickerPrice(75, 100, 50)).toBe('yellow');
  });

  it('returns yellow when price is at exactly sticker price', () => {
    expect(classifyStickerPrice(100, 100, 50)).toBe('yellow');
  });

  it('returns red when price is above sticker price', () => {
    expect(classifyStickerPrice(120, 100, 50)).toBe('red');
  });

  it('returns neutral when lastPrice is zero', () => {
    expect(classifyStickerPrice(0, 100, 50)).toBe('neutral');
  });

  it('returns neutral when lastPrice is negative', () => {
    expect(classifyStickerPrice(-10, 100, 50)).toBe('neutral');
  });

  it('returns neutral when mosPrice is null', () => {
    expect(classifyStickerPrice(50, 100, null)).toBe('neutral');
  });
});
