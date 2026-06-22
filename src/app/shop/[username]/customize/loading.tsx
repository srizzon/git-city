// Loading skeleton for the Customize screen (preview + slot rail + grid).
export default function CustomizeLoading() {
  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-5 space-y-2">
          <div className="h-3 w-16 animate-pulse bg-border/60" />
          <div className="h-4 w-28 animate-pulse bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
          <div className="space-y-3">
            <div className="h-72 animate-pulse border-[3px] border-border bg-bg-raised sm:h-96 lg:h-[34rem]" />
            <div className="h-28 animate-pulse border-[3px] border-border bg-bg-raised" />
          </div>
          <div>
            <div className="flex gap-2 border-b border-border pb-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 w-14 shrink-0 animate-pulse border-2 border-border bg-bg-raised" />)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse border-2 border-border bg-bg-raised" />)}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
