import Link from 'next/link';

export function NavBar() {
  return (
    <nav className="border-b border-border/60 bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-12 flex items-center gap-6">
        <Link href="/" className="font-semibold text-sm tracking-tight">
          PSEi Research
        </Link>
        <Link href="/screener" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Screener
        </Link>
      </div>
    </nav>
  );
}
