import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-24">
        <h1 className="text-3xl font-bold text-center mb-2">PSEi Stock Research</h1>
        <p className="text-center text-muted-foreground mb-10">
          Phil Town Rule #1 metrics for Philippine Stock Exchange companies
        </p>
        <SearchBar />
        <div className="text-center mt-8">
          <Link href="/screener" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
            View all stocks screener →
          </Link>
        </div>
      </div>
    </main>
  );
}
