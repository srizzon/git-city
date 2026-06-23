import Link from "next/link";

export default function DevNotFound() {
  const accent = "#c8e64a";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg font-pixel uppercase text-warm">
      <div className="text-center">
        <h1 className="text-5xl text-cream">404</h1>
        <p className="mt-4 text-xs text-muted normal-case">
          This dev hasn&apos;t been added to Git City yet
        </p>
        <Link
          href="/"
          className="btn-press mt-8 inline-block px-7 py-3.5 text-sm text-bg"
          style={{
            backgroundColor: accent,
            boxShadow: "4px 4px 0 0 #5a7a00",
          }}
        >
          Search in City
        </Link>
      </div>
    </main>
  );
}
