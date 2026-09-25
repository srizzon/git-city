import Link from "next/link";
import type { TownCard as Card } from "@/lib/towns/rows";

export function TownMeta({ card, className = "" }: { card: Card; className?: string }) {
  const parts: React.ReactNode[] = [];
  if (card.verified) parts.push(<span key="v" className="text-lime">&#10003; Verified</span>);
  if (card.buildings !== null) parts.push(<span key="b">{card.buildings.toLocaleString("en-US")} buildings</span>);
  if (parts.length === 0) return null;
  return <p className={`flex gap-3 text-xs text-muted ${className}`}>{parts}</p>;
}

export default function TownCard({ card }: { card: Card }) {
  return (
    <Link
      href={`/town/${card.slug}`}
      className="group block w-72 shrink-0 snap-start border-[3px] border-border bg-bg-card transition-colors hover:border-lime sm:w-80"
    >
      <div className="relative aspect-[1200/630] overflow-hidden border-b-[3px] border-border bg-bg">
        {/* The town's OG skyline (cached 1 h): the page's only 3D is the hero. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/town/${card.slug}/opengraph-image`} alt="" loading="lazy" className="h-full w-full object-cover" />
        {card.tag && (
          <span className="absolute bottom-2 right-2 bg-lime px-2 py-1 text-xs text-bg">
            {card.tag === "trending" ? "↑ Trending" : "New"}
          </span>
        )}
      </div>
      <div className="flex min-h-[4.75rem] flex-col justify-center gap-1.5 px-4 py-3">
        <p className="truncate text-sm text-cream normal-case">{card.name}</p>
        <TownMeta card={card} />
      </div>
    </Link>
  );
}
