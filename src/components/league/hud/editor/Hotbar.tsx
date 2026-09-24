"use client";

import { Hand, Trash2 } from "lucide-react";
import type { CityBuilding } from "@/lib/github";
import { HOTBAR, type HotbarTab, type Tool } from "@/lib/league-city/editor/state";
import type { CityObject, ItemType } from "@/lib/league-city/types";
import { Avatar, HUD_BOX } from "../shared";
import { ITEM_NAMES, ItemIcon } from "./icons";

const TABS: { id: HotbarTab; label: string }[] = [
  { id: "streets", label: "Streets" },
  { id: "nature", label: "Nature" },
  { id: "plaza", label: "Plaza" },
  { id: "stunts", label: "Stunts" },
  { id: "buildings", label: "Buildings" },
];

export function toolForSlot(tab: HotbarTab, slot: number): Tool | null {
  if (tab === "buildings") return null;
  const item: ItemType | undefined = HOTBAR[tab][slot];
  if (!item) return null;
  return item === "road" ? { kind: "road" } : { kind: "place", item };
}

export default function Hotbar({
  tab,
  slot,
  tool,
  newBuildings,
  buildingByDev,
  held,
  onTab,
  onSlot,
  onTool,
  onPickBuilding,
  onWheel,
  hint,
}: {
  tab: HotbarTab;
  slot: number;
  tool: Tool;
  newBuildings: CityObject[];
  buildingByDev: ReadonlyMap<number, CityBuilding>;
  held: string | null;
  onTab: (t: HotbarTab) => void;
  onSlot: (i: number) => void;
  onTool: (t: Tool) => void;
  onPickBuilding: (id: string) => void;
  onWheel: (dir: 1 | -1) => void;
  /** What a click does right now. */
  hint: string;
}) {
  const items = tab === "buildings" ? [] : HOTBAR[tab];
  const slotActive = tool.kind === "place" || tool.kind === "road";

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-center gap-2 font-pixel uppercase">
      <p aria-live="polite" className="max-w-full truncate bg-bg/70 px-2 py-1 text-[9px] text-cream normal-case backdrop-blur-sm">
        {hint}
      </p>
      <div role="tablist" aria-label="Item groups" className={`${HUD_BOX} flex divide-x-2 divide-border`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`px-3 py-1.5 text-[9px] transition-colors hover:bg-white/5 ${tab === t.id ? "bg-white/5 text-lime" : "text-muted"}`}
          >
            {t.label}
            {t.id === "buildings" && newBuildings.length > 0 && <span className="ml-1.5 text-lime">{newBuildings.length}</span>}
          </button>
        ))}
      </div>

      <div
        className={`${HUD_BOX} flex items-stretch`}
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > 2) onWheel(e.deltaY > 0 ? 1 : -1);
        }}
      >
        <div className="flex divide-x-2 divide-border border-r-2 border-border">
          <ToolButton label="Hand: pick up and move (H)" shortcut="H" active={tool.kind === "select"} onClick={() => onTool({ kind: "select" })}>
            <Hand size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
          <ToolButton label="Delete (Del, or right-click)" shortcut="Del" active={tool.kind === "bulldoze"} danger onClick={() => onTool({ kind: "bulldoze" })}>
            <Trash2 size={18} strokeWidth={2.25} aria-hidden />
          </ToolButton>
        </div>

        <div className="flex gap-1 p-1.5">
          {tab !== "buildings" &&
            items.map((item, i) => (
              <Slot
                key={item}
                index={i}
                label={ITEM_NAMES[item]}
                active={slotActive && slot === i}
                onClick={() => onSlot(i)}
              >
                <ItemIcon item={item} size={28} />
              </Slot>
            ))}
          {tab === "buildings" &&
            (newBuildings.length === 0 ? (
              <p className="flex h-[52px] items-center px-3 text-[9px] text-dim normal-case">
                New members show up here. Pick one to place it.
              </p>
            ) : (
              newBuildings.slice(0, 9).map((o, i) => {
                const b = o.developer_id !== null ? buildingByDev.get(o.developer_id) : undefined;
                return (
                  <Slot key={o.id} index={i} label={b ? `@${b.login}` : "Building"} active={held === o.id} onClick={() => onPickBuilding(o.id)}>
                    <Avatar src={b?.avatar_url ?? null} size={28} />
                  </Slot>
                );
              })
            ))}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  active,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`relative flex w-12 items-center justify-center transition-colors hover:bg-white/5 [&>*]:transition-transform active:[&>*]:translate-y-px ${active ? (danger ? "bg-red-500/15 text-red-400" : "bg-lime/10 text-lime") : "text-muted"}`}
    >
      {children}
      <span className={`absolute left-1 top-0.5 text-[8px] ${active ? "" : "text-dim"}`}>{shortcut}</span>
    </button>
  );
}

function Slot({ index, label, active, onClick, children }: { index: number; label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={`${label} (${index + 1})`}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`group relative flex h-[52px] w-[52px] items-center justify-center border-2 transition-colors ${
        active ? "border-lime bg-lime/10" : "border-border bg-bg-raised/60 hover:border-border-light"
      }`}
    >
      <span className="transition-transform group-active:translate-y-px">{children}</span>
      <span className={`absolute left-1 top-0.5 text-[8px] ${active ? "text-lime" : "text-dim"}`}>{index + 1}</span>
    </button>
  );
}

/** Camera controls, bottom right, like the home city's nav hints. */
export function CameraHints() {
  const row = (k: string, v: string) => (
    <div>
      <span className="text-cream">{k}</span> {v}
    </div>
  );
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-30 text-right font-pixel text-[9px] uppercase leading-loose text-muted">
      {row("Drag", "orbit")}
      {row("Right-drag", "pan")}
      {row("Scroll", "zoom")}
      {row("Click", "act")}
      {row("Right-click", "delete")}
      {row("H / Del", "hand / delete tool")}
      {row("Q / E", "turn 90°")}
      {row("G", "grid")}
    </div>
  );
}
