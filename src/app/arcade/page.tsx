"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RoomInfo } from "@/lib/arcade/types";

const ACCENT = "#c8e64a";
const SHADOW = "#5a7a00";
const CATEGORIES = ["social", "work", "games", "events", "chill", "dev", "art", "music"] as const;

interface RoomRow {
  id: string;
  slug: string;
  name: string;
  room_type: string;
  max_players: number;
  visibility: string;
  category: string | null;
  description: string | null;
  is_featured: boolean;
}

export default function ArcadeBrowserPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [recentVisitIds, setRecentVisitIds] = useState<string[]>([]);
  const [liveCounts, setLiveCounts] = useState<Map<string, number>>(new Map());
  const [showEmpty, setShowEmpty] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalOnline, setTotalOnline] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchRooms = useCallback(async (searchQuery: string, cat: string | null, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "20" });
      if (searchQuery) params.set("q", searchQuery);
      if (cat) params.set("category", cat);

      const apiRes = await fetch(`/api/arcade/rooms?${params}`);
      const data = await apiRes.json();

      setRooms(data.rooms ?? []);
      setTotal(data.total ?? 0);
      setFavorites(new Set(data.favorites ?? []));
      setRecentVisitIds((data.recentVisits ?? []).map((v: { room_id: string }) => v.room_id));
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live player counts from lobby party
  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!host) return;
    const base = host.startsWith("http")
      ? host
      : `${host.includes("localhost") ? "http" : "https"}://${host}`;

    // Fetch room list with counts
    fetch(`${base}/parties/lobby/main/rooms`)
      .then((r) => r.json())
      .then((d: { rooms?: RoomInfo[] }) => {
        const counts = new Map<string, number>();
        let online = 0;
        for (const r of d.rooms ?? []) {
          counts.set(r.slug, r.playerCount);
          online += r.playerCount;
        }
        setLiveCounts(counts);
        setTotalOnline(online);
      })
      .catch(() => {});
  }, []);

  // Initial fetch + redirect if only 1 room
  useEffect(() => {
    async function init() {
      const res = await fetch("/api/arcade/rooms?limit=2");
      const data = await res.json();
      const roomList = data.rooms ?? [];
      if (roomList.length === 1) {
        router.replace(`/arcade/${roomList[0].slug}`);
        return;
      }
      if (roomList.length === 0) {
        router.replace("/arcade/lobby");
        return;
      }
      fetchRooms("", null, 1);
    }
    init();
  }, [router, fetchRooms]);

  // Debounced search
  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchRooms(value, category, 1);
    }, 300);
  };

  const handleCategory = (cat: string | null) => {
    setCategory(cat);
    setPage(1);
    fetchRooms(search, cat, 1);
  };

  const handlePage = (pg: number) => {
    setPage(pg);
    fetchRooms(search, category, pg);
  };

  const toggleFavorite = async (roomId: string) => {
    const prev = new Set(favorites);
    const next = new Set(favorites);
    if (next.has(roomId)) next.delete(roomId);
    else next.add(roomId);
    setFavorites(next);

    try {
      const res = await fetch("/api/arcade/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });
      if (!res.ok) setFavorites(prev);
    } catch {
      setFavorites(prev);
    }
  };

  // Split rooms into sections
  const recentRooms = rooms.filter((r) => recentVisitIds.includes(r.id));
  const featuredRooms = rooms.filter((r) => r.is_featured && !recentVisitIds.includes(r.id));
  const otherRooms = rooms.filter((r) => !r.is_featured && !recentVisitIds.includes(r.id));

  const filterEmpty = (list: RoomRow[]) =>
    showEmpty ? list : list.filter((r) => (liveCounts.get(r.slug) ?? 0) > 0 || r.room_type === "official_floor");

  const totalPages = Math.ceil(total / 20);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-lg px-3 py-6 sm:px-4 sm:py-10">

        {/* Back */}
        <button
          onClick={() => router.push("/")}
          className="mb-4 text-[10px] text-muted transition-colors hover:text-cream"
        >
          &larr; Back to city
        </button>

        {/* Header */}
        <div className="border-[3px] border-border bg-bg-raised p-4 sm:p-6 pixel-shadow">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center border-2"
              style={{ borderColor: ACCENT, backgroundColor: ACCENT + "11" }}
            >
              <span className="text-lg" style={{ color: ACCENT }}>E.</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold" style={{ color: ACCENT }}>E.Arcade</h1>
              <p className="text-[9px] text-muted normal-case">Choose a room to enter</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-center gap-1.5">
                {totalOnline > 0 && (
                  <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: ACCENT }} />
                )}
                <span className="text-[10px] text-muted">
                  {totalOnline} online
                </span>
              </div>
              <p className="text-[8px] text-dim mt-0.5">
                {total} room{total !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="mt-3 border-[3px] border-border bg-bg-raised p-4">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search rooms..."
            className="w-full px-3 py-2 bg-bg border-2 border-border text-[10px] text-cream placeholder:text-dim outline-none transition-colors focus:border-lime normal-case"
          />

          {/* Categories */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => handleCategory(null)}
              className="px-2.5 py-1 text-[8px] tracking-wider border-2 transition-all btn-press"
              style={{
                borderColor: !category ? ACCENT : "#2a2a30",
                color: !category ? ACCENT : "#8c8c9c",
                backgroundColor: !category ? ACCENT + "11" : "transparent",
                boxShadow: !category ? `2px 2px 0 0 ${SHADOW}` : "none",
              }}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategory(category === cat ? null : cat)}
                className="px-2.5 py-1 text-[8px] tracking-wider border-2 transition-all btn-press"
                style={{
                  borderColor: category === cat ? ACCENT : "#2a2a30",
                  color: category === cat ? ACCENT : "#8c8c9c",
                  backgroundColor: category === cat ? ACCENT + "11" : "transparent",
                  boxShadow: category === cat ? `2px 2px 0 0 ${SHADOW}` : "none",
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Show empty toggle */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setShowEmpty(!showEmpty)}
              className="h-4 w-4 border-2 border-border flex items-center justify-center transition-colors"
              style={{
                borderColor: showEmpty ? ACCENT : "#2a2a30",
                backgroundColor: showEmpty ? ACCENT + "22" : "transparent",
              }}
            >
              {showEmpty && <span className="text-[8px]" style={{ color: ACCENT }}>+</span>}
            </button>
            <span className="text-[8px] text-muted">Show empty rooms</span>
          </div>
        </div>

        {/* Room List */}
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="border-[3px] border-border bg-bg-raised p-8 text-center">
              <span className="text-[10px] text-muted">
                Loading<span className="blink-dot">.</span><span className="blink-dot" style={{ animationDelay: "0.3s" }}>.</span><span className="blink-dot" style={{ animationDelay: "0.6s" }}>.</span>
              </span>
            </div>
          ) : (
            <>
              {/* Recently Visited */}
              {recentRooms.length > 0 && (
                <RoomSection
                  title="Recently Visited"
                  rooms={recentRooms}
                  liveCounts={liveCounts}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onNavigate={(slug) => router.push(`/arcade/${slug}`)}
                />
              )}

              {/* Featured */}
              {filterEmpty(featuredRooms).length > 0 && (
                <RoomSection
                  title="Featured"
                  rooms={filterEmpty(featuredRooms)}
                  liveCounts={liveCounts}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onNavigate={(slug) => router.push(`/arcade/${slug}`)}
                />
              )}

              {/* All Rooms */}
              {filterEmpty(otherRooms).length > 0 && (
                <RoomSection
                  title={search ? `"${search}"` : "Rooms"}
                  rooms={filterEmpty(otherRooms)}
                  liveCounts={liveCounts}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  onNavigate={(slug) => router.push(`/arcade/${slug}`)}
                />
              )}

              {/* Empty state */}
              {rooms.length === 0 && (
                <div className="border-[3px] border-border bg-bg-raised p-8 text-center">
                  <p className="text-[10px] text-muted normal-case">
                    {search ? `No rooms found for "${search}"` : "No rooms available"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-[9px] border-2 border-border text-muted transition-all hover:border-border-light hover:text-cream disabled:opacity-30 btn-press"
            >
              &larr; Prev
            </button>
            <span className="text-[9px] text-dim">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-[9px] border-2 border-border text-muted transition-all hover:border-border-light hover:text-cream disabled:opacity-30 btn-press"
            >
              Next &rarr;
            </button>
          </div>
        )}

      </div>
    </main>
  );
}

// ─── Room Section ───────────────────────────────────────────
function RoomSection({
  title,
  rooms,
  liveCounts,
  favorites,
  onToggleFavorite,
  onNavigate,
}: {
  title: string;
  rooms: RoomRow[];
  liveCounts: Map<string, number>;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onNavigate: (slug: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[8px] text-dim tracking-widest">{title}</p>
      <div className="space-y-1.5">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            playerCount={liveCounts.get(room.slug) ?? 0}
            isFavorite={favorites.has(room.id)}
            onToggleFavorite={() => onToggleFavorite(room.id)}
            onClick={() => onNavigate(room.slug)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Room Card ──────────────────────────────────────────────
function RoomCard({
  room,
  playerCount,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  room: RoomRow;
  playerCount: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  const hasPlayers = playerCount > 0;
  const capacityPct = room.max_players > 0 ? playerCount / room.max_players : 0;

  return (
    <div
      className="group border-[3px] border-border bg-bg-raised transition-all hover:border-border-light cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-stretch">
        {/* Left accent bar */}
        <div
          className="w-1 shrink-0 transition-colors"
          style={{
            backgroundColor: hasPlayers ? ACCENT : "#2a2a30",
          }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold text-cream truncate">{room.name}</p>
            {room.is_featured && (
              <span
                className="shrink-0 text-[7px] px-1.5 py-0.5 tracking-widest border"
                style={{ color: ACCENT, borderColor: ACCENT + "44", backgroundColor: ACCENT + "11" }}
              >
                Featured
              </span>
            )}
            {room.visibility === "password" && (
              <span className="shrink-0 text-[7px] px-1.5 py-0.5 tracking-widest border border-border text-dim">
                Locked
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {room.category && (
              <span className="text-[7px] text-dim tracking-wider">{room.category}</span>
            )}
            {room.description && (
              <span className="text-[8px] text-muted truncate normal-case">{room.description}</span>
            )}
          </div>
        </div>

        {/* Right side: counts + favorite */}
        <div className="shrink-0 flex items-center gap-2 pr-3">
          {/* Player count */}
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              {hasPlayers && (
                <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: ACCENT }} />
              )}
              <span
                className="text-[10px]"
                style={{
                  color: capacityPct > 0.8 ? "#f85151" : capacityPct > 0.5 ? "#f0c060" : hasPlayers ? ACCENT : "#5c5c6c",
                }}
              >
                {playerCount}/{room.max_players}
              </span>
            </div>
            {/* Capacity bar */}
            <div className="mt-1 h-0.5 w-10 bg-border overflow-hidden">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(capacityPct * 100, 100)}%`,
                  backgroundColor: capacityPct > 0.8 ? "#f85151" : capacityPct > 0.5 ? "#f0c060" : ACCENT,
                }}
              />
            </div>
          </div>

          {/* Favorite */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className="h-6 w-6 flex items-center justify-center border border-border text-[10px] transition-all hover:border-border-light"
            style={{
              color: isFavorite ? "#fbbf24" : "#5c5c6c",
              backgroundColor: isFavorite ? "#fbbf2411" : "transparent",
              borderColor: isFavorite ? "#fbbf2444" : undefined,
            }}
          >
            {isFavorite ? "*" : "-"}
          </button>
        </div>
      </div>
    </div>
  );
}
