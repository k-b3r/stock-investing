interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{ticker.toUpperCase()}</h1>
        <p className="text-muted-foreground">Dashboard coming soon</p>
      </div>
    </main>
  );
}
