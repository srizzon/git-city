// Route-level loading skeleton — shown while the server fetches the catalog +
// viewer context, so the Shop never flashes blank on navigation.
export default function ShopLoading() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse bg-border/60" />
            <div className="h-4 w-20 animate-pulse bg-border" />
          </div>
          <div className="h-8 w-44 animate-pulse bg-border" />
        </div>

        <div className="mb-4 flex gap-3 border-b border-border pb-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-5 w-16 animate-pulse bg-border/60" />)}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-square animate-pulse border-2 border-border bg-bg-raised" />)}
          </div>
          <div className="hidden h-[34rem] animate-pulse border-[3px] border-border bg-bg-raised lg:block" />
        </div>
      </div>
    </main>
  );
}
