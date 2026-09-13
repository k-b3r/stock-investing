export async function getUsdToPhpRate(init?: RequestInit): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', init);
    if (!res.ok) return null;

    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== 'success') return null;

    const rate = data.rates?.PHP;
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}
