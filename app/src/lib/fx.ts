// Server-side only — never import from a client component

export async function getUsdToPhpRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== 'success') return null;

    const rate = data.rates?.PHP;
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}
