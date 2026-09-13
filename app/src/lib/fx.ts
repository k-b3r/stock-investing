// Server-side only — never import from a client component
import { getUsdToPhpRate as sharedGetUsdToPhpRate } from '../../../shared/fx';

export function getUsdToPhpRate(): Promise<number | null> {
  return sharedGetUsdToPhpRate({ next: { revalidate: 86400 } });
}
