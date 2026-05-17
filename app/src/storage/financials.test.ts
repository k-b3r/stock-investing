import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from './db';
import { getFinancials } from './financials';

describe('getFinancials', () => {
  afterAll(async () => {
    await (await getPool()).end();
  });

  it('returns RawFinancials for a known ticker', async () => {
    const result = await getFinancials('BDO');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('BDO');
    expect(result!.data).toHaveProperty('growth');
    expect(result!.data).toHaveProperty('profitability');
    expect(result!.scraped_at).toBeTruthy();
  });

  it('returns null for unknown ticker', async () => {
    const result = await getFinancials('DOESNOTEXIST');
    expect(result).toBeNull();
  });

  it('normalises ticker to uppercase', async () => {
    const result = await getFinancials('bdo');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('BDO');
  });
});
