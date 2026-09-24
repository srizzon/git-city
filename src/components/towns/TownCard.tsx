import Link from "next/link";
import type { TownCard as Card } from "@/lib/towns/rows";

export function TownMeta({ card }: { card: Card }) {
  const parts: React.ReactNode[] = [];
  if (card.verified) parts.push(<span key="v" className="text-lime">&#10003; Verified</span>);
  if (card.buildings !== null) parts.push(<span key="b">{card.buildings.toLocaleString("en-US")} buildings</span>);
  if (parts.length === 0) return null;
  return <p className="mt-1 flex gap-2 text-[9px] text-muted">{parts}</p>;
}

export default function TownCard({ card }: { card: Card }) {
  return (
    <Link
      href={`/town/${card.slug}`}
      className="group block w-56 shrink-0 snap-start border-[3px] border-border bg-bg-card transition-colors hover:border-lime sm:w-64"
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-bg">
        {/* The town's OG skyline (cached 1 h): the page's only 3D is the hero. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/town/${card.slug}/opengraph-image`} alt="" loading="lazy" className="h-full w-full object-cover" />
        {card.tag && (
          <span className="absolute right-2 bottom-2 bg-lime px-1.5 py-0.5 text-[9px] text-bg">
            {card.tag === "trending" ? "↑ Trending" : "New"}
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-xs text-cream normal-case">{card.name}</p>
        <TownMeta card={card} />
      </div>
    </Link>
  );
}
