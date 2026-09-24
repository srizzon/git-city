"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CityBuilding } from "@/lib/github";
import { maxLot, minLot } from "@/lib/league-city/grid";
import { freeLotsInOrder, lotKey } from "@/lib/league-city/placement";
import { ghostFit } from "@/lib/league-city/editor/ghost";
import { lPath } from "@/lib/league-city/editor/paint";
import { keyToAction } from "@/lib/league-city/editor/shortcuts";
import { HOTBAR, type EditorState, type HotbarTab } from "@/lib/league-city/editor/state";
import type { EditorStore } from "@/lib/league-city/editor/store";
import type { CityObject } from "@/lib/league-city/types";
import type { EditCameraApi, LotEvent } from "./EditCamera";
import type { GhostSpec } from "./EditorOverlay";
import { toolForSlot } from "../hud/editor/Hotbar";

// Glue between input and the editor reducer: pointer events on lots, the
// keyboard, and the derived visuals (ghost, road path) for the overlay.

function uuid(): string {
  return crypto.randomUUID();
}

function objectAt(s: EditorState, x: number, z: number): CityObject | undefined {
  for (const o of s.objects.values()) if (o.x === x && o.z === z) return o;
  return undefined;
}

function tabOf(item: string): Exclude<HotbarTab, "buildings"> | null {
  for (const t of Object.keys(HOTBAR) as Exclude<HotbarTab, "buildings">[]) if ((HOTBAR[t] as string[]).includes(item)) return t;
  return null;
}

export function useEditorState(store: EditorStore): EditorState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useEditorController({
  store,
  active,
  buildingByDev,
  cameraApi,
  onPreview,
}: {
  store: EditorStore;
  /** Edit mode (not preview): pointer and keys drive the editor. */
  active: boolean;
  buildingByDev: ReadonlyMap<number, CityBuilding>;
  cameraApi: React.MutableRefObject<EditCameraApi | null>;
  onPreview: () => void;
}) {
  const state = useEditorState(store);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);
  const [grid, setGrid] = useState(true);
  const dragFrom = useRef<[number, number] | null>(null);

  /** Picks a building up and eases the camera to the free lot nearest the center. */
  const pickBuilding = useCallback(
    (id: string) => {
      const s = store.getState();
      store.dispatch({ type: "setTool", tool: { kind: "select" } });
      store.dispatch({ type: "pickUp", id });
      const occupied = new Set([...s.objects.values()].map((o) => lotKey(o.x, o.z)));
      const roads = new Set([...s.objects.values()].filter((o) => o.item_type === "road").map((o) => lotKey(o.x, o.z)));
      const free = freeLotsInOrder(occupied, roads, minLot(s.size), maxLot(s.size))[0];
      if (free) cameraApi.current?.lookAtLot(free[0], free[1]);
    },
    [store, cameraApi],
  );

  const selectSlot = useCallback(
    (slot: number) => {
      const s = store.getState();
      if (s.hotbarTab === "buildings") {
        const fresh = [...s.objects.values()].filter((o) => o.kind === "building" && o.is_new);
        const o = fresh[slot];
        if (o) pickBuilding(o.id);
        return;
      }
      const tool = toolForSlot(s.hotbarTab, slot);
      if (!tool) return;
      store.dispatch({ type: "setSlot", slot });
      store.dispatch({ type: "setTool", tool });
    },
    [store, pickBuilding],
  );

  const onLot = useCallback(
    (e: LotEvent) => {
      if (!active) return;
      const s = store.getState();
      if (e.kind === "leave") {
        setHover(null);
        return;
      }
      setHover([e.x, e.z]);
      const tool = s.tool;

      if (e.kind === "pick") {
        const o = objectAt(s, e.x, e.z);
        if (!o) return;
        if (o.kind === "item" && o.item_type) {
          const tab = tabOf(o.item_type);
          if (!tab) return;
          const slot = (HOTBAR[tab] as string[]).indexOf(o.item_type);
          store.dispatch({ type: "setTab", tab });
          store.dispatch({ type: "setSlot", slot });
          store.dispatch({ type: "setTool", tool: toolForSlot(tab, slot)! });
        } else {
          store.dispatch({ type: "setTool", tool: { kind: "select" } });
          store.dispatch({ type: "pickUp", id: o.id });
        }
        return;
      }

      if (tool.kind === "road") {
        if (e.kind === "down") {
          dragFrom.current = [e.x, e.z];
          setRoadPath(lPath([e.x, e.z], [e.x, e.z], s.objects.values(), s.size));
        } else if (e.kind === "drag" && dragFrom.current) {
          setRoadPath(lPath(dragFrom.current, [e.x, e.z], s.objects.values(), s.size));
        } else if (e.kind === "up" && dragFrom.current) {
          const lots = lPath(dragFrom.current, [e.x, e.z], s.objects.values(), s.size);
          dragFrom.current = null;
          setRoadPath(null);
          if (lots.length === 0) store.dispatch({ type: "notify", kind: "hint", message: "That lot is taken." });
          else store.dispatch({ type: "paintRoad", lots, ids: lots.map(() => uuid()) });
        }
        return;
      }

      if (e.kind !== "down") return;
      if (tool.kind === "place") {
        store.dispatch({ type: "place", x: e.x, z: e.z, id: uuid() });
        return;
      }
      if (tool.kind === "bulldoze") {
        store.dispatch({ type: "removeAt", x: e.x, z: e.z });
        return;
      }
      // Hand (The Sims): click picks up, the next click drops.
      if (s.held) {
        store.dispatch({ type: "drop", x: e.x, z: e.z });
        return;
      }
      const o = objectAt(s, e.x, e.z);
      if (o) store.dispatch({ type: "pickUp", id: o.id });
    },
    [active, store],
  );

  // Keyboard. Camera keys (Q/E, WASD, arrows) belong to EditCamera.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const a = keyToAction(e);
      if (!a) return;
      const s = store.getState();
      const target = s.held;
      switch (a.type) {
        case "slot":
          selectSlot(a.slot);
          break;
        case "rotate":
          if (target) store.dispatch({ type: "rotate", id: target });
          break;
        case "remove":
          if (target) store.dispatch({ type: "remove", id: target });
          break;
        case "cancel":
          dragFrom.current = null;
          setRoadPath(null);
          store.dispatch({ type: "cancel" });
          break;
        case "undo":
          store.dispatch({ type: "undo" });
          break;
        case "redo":
          store.dispatch({ type: "redo" });
          break;
        case "grid":
          setGrid((g) => !g);
          break;
        case "preview":
          onPreview();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, store, selectSlot, onPreview]);

  const ghost = useMemo<GhostSpec | null>(() => {
    if (!active || !hover) return null;
    const [x, z] = hover;
    const fit = ghostFit(state, x, z);
    if (state.held) {
      const o = state.objects.get(state.held);
      if (!o) return null;
      if (o.kind === "building" && o.developer_id !== null) {
        const b = buildingByDev.get(o.developer_id);
        return b ? { x, z, fit, thing: { kind: "building", building: b, rot: state.heldRot } } : null;
      }
      return o.item_type ? { x, z, fit, thing: { kind: "item", item: o.item_type, rot: state.heldRot } } : null;
    }
    if (state.tool.kind === "bulldoze") {
      const o = objectAt(state, x, z);
      if (!o) return null;
      return { x, z, fit: o.kind === "item" ? { ok: true } : { ok: false, reason: "lot_taken" }, thing: { kind: "bulldoze" } };
    }
    if (state.tool.kind === "road") return { x, z, fit, thing: { kind: "road" } };
    if (state.tool.kind === "place") return { x, z, fit, thing: { kind: "item", item: state.tool.item, rot: 0 } };
    return null;
  }, [active, hover, state, buildingByDev]);

  const hovered = active && hover ? objectAt(state, hover[0], hover[1]) : undefined;
  const hint = editorHint(state, hovered);

  return { state, onLot, ghost, hover, roadPath, grid, selectSlot, pickBuilding, hint };
}

/** One line telling the admin what a click does right now. */
function editorHint(s: EditorState, hovered: CityObject | undefined): string {
  if (s.held) {
    const o = s.objects.get(s.held);
    return o?.kind === "building"
      ? "Click a lot to drop it · drop on a building to swap · R rotate · Esc put back"
      : "Click a lot to drop it · R rotate · Delete remove · Esc put back";
  }
  switch (s.tool.kind) {
    case "bulldoze":
      if (hovered?.kind === "building") return "Bulldozer: buildings stay. Remove people in Settings";
      return "Bulldozer: click an item to delete it · Esc to stop";
    case "road":
      return "Road: click or drag to paint · Esc to stop";
    case "place":
      return "Click a lot to place · keep clicking to place more · Esc to stop";
    default:
      return hovered ? "Click to pick it up" : "Click something to move it · 1–9 pick an item";
  }
}
