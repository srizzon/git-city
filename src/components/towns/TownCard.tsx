import Link from "next/link";
import type { TownCard as Card } from "@/lib/towns/rows";
import type { GridTown } from "@/lib/towns/discover";
import { SKY_SWATCHES } from "@/lib/league-city/identity";

export function TownMeta({ card, className = "" }: { card: Card; className?: string }) {
  const parts: React.ReactNode[] = [];
  if (card.verified) parts.push(<span key="v" className="text-lime">&#10003; Verified</span>);
  if (card.buildings !== null) parts.push(<span key="b">{card.buildings.toLocaleString("en-US")} buildings</span>);
  if (parts.length === 0) return null;
  return <p className={`flex gap-3 text-xs text-muted ${className}`}>{parts}</p>;
}

/** Search results and anywhere without a map: the town's OG card. */
export default function TownCard({ card }: { card: Card }) {
  return (
    <Link
      href={`/town/${card.slug}`}
      className="group block w-72 shrink-0 snap-start border-[3px] border-border bg-bg-card transition-colors hover:border-lime sm:w-80"
    >
      <div className="relative aspect-[1200/630] overflow-hidden border-b-[3px] border-border bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/town/${card.slug}/og`} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="flex min-h-[4.75rem] flex-col justify-center gap-1.5 px-4 py-3">
        <p className="truncate text-sm text-cream normal-case">{card.name}</p>
        <TownMeta card={card} />
      </div>
    </Link>
  );
}

/** The Discover grid's card: a photo of the real town. */
export function GridTownCard({ town }: { town: GridTown }) {
  const tags = [
    town.yours && { label: "You live here", cls: "bg-cream text-bg" },
    town.tag === "trending" && { label: "↑ Trending", cls: "bg-lime text-bg" },
    town.tag === "new" && { label: "New", cls: "bg-lime text-bg" },
  ].filter(Boolean) as { label: string; cls: string }[];
  return (
    <Link href={`/town/${town.slug}`} className="group flex flex-col border-[3px] border-border bg-bg-card transition-[border-color,transform] hover:-translate-y-0.5 hover:border-lime">
      <div className="relative aspect-[16/10] overflow-hidden border-b-[3px] border-border bg-bg">
        {town.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={town.cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          // Before the town page has photographed it: its sky, its logo, its name.
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-3 px-4"
            style={{ background: `linear-gradient(180deg, ${(SKY_SWATCHES[town.sky] ?? SKY_SWATCHES[1]).join(", ")})` }}
          >
            {town.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={town.logoUrl} alt="" width={64} height={64} className="h-16 w-16 [image-rendering:pixelated]" />
            )}
            <span className="text-center text-lg leading-tight text-cream normal-case [text-wrap:balance]">{town.name}</span>
          </div>
        )}
        {town.cover && town.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={town.logoUrl} alt="" width={32} height={32} className="absolute top-2 left-2 h-8 w-8 [image-rendering:pixelated] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
        )}
        {tags.length > 0 && (
          <div className="absolute top-2 right-2 flex gap-1">
            {tags.map((t) => (
              <span key={t.label} className={`px-2 py-1 text-[10px] ${t.cls}`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3">
        <p className="truncate text-sm text-cream normal-case">{town.name}</p>
        <p className="flex gap-3 text-[11px] text-muted">
          <span className={town.kind === "company" ? "text-lime" : ""}>{town.kind === "company" ? "✓ Company" : town.country ? "Country" : "Group"}</span>
          {town.buildings !== null && <span>{town.buildings.toLocaleString("en-US")} buildings</span>}
        </p>
      </div>
    </Link>
  );
}
