"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CityBuilding } from "@/lib/github";
import { bounds } from "@/lib/league-city/grid";
import { isAir } from "@/lib/league-city/catalog";
import { freeLotsInOrder, lotKey } from "@/lib/league-city/placement";
import { ghostFit, type GhostFit } from "@/lib/league-city/editor/ghost";
import { lPath } from "@/lib/league-city/editor/paint";
import { keyToAction } from "@/lib/league-city/editor/shortcuts";
import { HOTBAR, objectAtSpot, type EditorState, type HotbarTab, type Spot } from "@/lib/league-city/editor/state";
import type { EditorStore } from "@/lib/league-city/editor/store";
import { isSurface, type CityObject, type ItemType } from "@/lib/league-city/types";
import type { EditCameraApi, LotEvent } from "./EditCamera";
import type { GhostSpec } from "./EditorOverlay";
import { toolForSlot } from "../hud/editor/Hotbar";
import { ITEM_NAMES } from "../hud/editor/icons";

// Glue between input and the editor reducer: pointer events, the keyboard,
// and the derived visuals (ghost, road path, hint line).

function uuid(): string {
  return crypto.randomUUID();
}

function tabOf(item: string): Exclude<HotbarTab, "buildings"> | null {
  for (const t of Object.keys(HOTBAR) as Exclude<HotbarTab, "buildings">[]) if ((HOTBAR[t] as string[]).includes(item)) return t;
  return null;
}

function nameOf(o: CityObject | undefined): string {
  if (!o) return "it";
  if (o.kind === "building") return "the building";
  return `the ${(ITEM_NAMES[o.item_type as ItemType] ?? "item").toLowerCase()}`;
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
  const [hover, setHover] = useState<Spot | null>(null);
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
      const free = freeLotsInOrder(occupied, roads, bounds(s.h))[0];
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
      const spot: Spot = { x: e.x, z: e.z, wx: e.wx, wz: e.wz, free: e.free, propId: e.propId };
      setHover(spot);
      const tool = s.tool;

      if (e.kind === "erase") {
        if (!s.held) store.dispatch({ type: "removeAt", ...spot });
        return;
      }

      if (e.kind === "hover") {
        // A road in progress follows the cursor as an L.
        if (tool.kind === "road" && dragFrom.current) setRoadPath(lPath(dragFrom.current, [e.x, e.z], s.objects.values(), s.h));
        return;
      }

      if (e.kind === "pick") {
        // Middle/Alt-click: take the item under the cursor into the hotbar.
        const o = objectAtSpot(s.objects, spot);
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

      // Roads: click where it starts, click where it ends (Cities: Skylines).
      if (tool.kind === "road") {
        if (!dragFrom.current) {
          dragFrom.current = [e.x, e.z];
          setRoadPath(lPath([e.x, e.z], [e.x, e.z], s.objects.values(), s.h));
          return;
        }
        const lots = lPath(dragFrom.current, [e.x, e.z], s.objects.values(), s.h);
        dragFrom.current = null;
        setRoadPath(null);
        if (lots.length === 0) store.dispatch({ type: "notify", kind: "hint", message: "A building is in the way." });
        else store.dispatch({ type: "paintRoad", lots, ids: lots.map(() => uuid()) });
        return;
      }

      if (tool.kind === "place") {
        const id = uuid();
        store.dispatch({ type: "place", id, ...spot });
        // A new plane or blimp opens its panel (message, colors).
        if (isAir(tool.item) && store.getState().objects.has(id)) store.dispatch({ type: "select", id });
        return;
      }
      if (tool.kind === "bulldoze") {
        store.dispatch({ type: "removeAt", ...spot });
        return;
      }
      // Hand (The Sims): click picks up, the next click drops.
      if (s.held) {
        store.dispatch({ type: "drop", ...spot });
        return;
      }
      const o = objectAtSpot(s.objects, spot);
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
      switch (a.type) {
        case "slot":
          selectSlot(a.slot);
          break;
        case "rotate":
          store.dispatch({ type: "rotate" });
          break;
        case "remove":
          // Delete: removes what's in hand, else toggles the delete tool.
          if (s.held) store.dispatch({ type: "remove", id: s.held });
          else store.dispatch({ type: "setTool", tool: s.tool.kind === "bulldoze" ? { kind: "select" } : { kind: "bulldoze" } });
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
        case "hand":
          store.dispatch({ type: "setTool", tool: { kind: "select" } });
          break;

        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, store, selectSlot, onPreview]);

  // A half-laid road is dropped when the tool changes.
  useEffect(() => {
    let kind = store.getState().tool.kind;
    return store.subscribe(() => {
      const next = store.getState().tool.kind;
      if (next === kind) return;
      kind = next;
      dragFrom.current = null;
      setRoadPath(null);
    });
  }, [store]);

  const hovered = active && hover ? objectAtSpot(state.objects, hover) : undefined;

  const ghost = useMemo<GhostSpec | null>(() => {
    if (!active || !hover) return null;
    const { x, z } = hover;
    if (state.tool.kind === "bulldoze") {
      if (!hovered) return null;
      const fit: GhostFit = hovered.kind === "item" ? { ok: true } : { ok: false, reason: "Buildings stay." };
      return { x, z, fit, thing: { kind: "bulldoze", target: hovered } };
    }
    const fit = ghostFit(state, hover);
    if (!fit) return null;
    if (state.held) {
      const o = state.objects.get(state.held);
      if (!o) return null;
      if (o.kind === "building" && o.developer_id !== null) {
        const b = buildingByDev.get(o.developer_id);
        return b ? { x, z, fit, thing: { kind: "building", building: b, rot: state.heldRot } } : null;
      }
      if (!o.item_type) return null;
      return isSurface(o.item_type)
        ? { x, z, fit, thing: { kind: "surface", item: o.item_type } }
        : { x, z, fit, thing: { kind: "prop", item: o.item_type, rot: state.heldRot } };
    }
    if (state.tool.kind === "road") return { x, z, fit, thing: { kind: "road" } };
    if (state.tool.kind === "place") {
      const item = state.tool.item;
      return isSurface(item)
        ? { x, z, fit, thing: { kind: "surface", item } }
        : { x, z, fit, thing: { kind: "prop", item, rot: state.placeRot } };
    }
    return null;
  }, [active, hover, hovered, state, buildingByDev]);

  const shownPath = active ? roadPath : null;
  const hint = editorHint(state, hovered, ghost, shownPath !== null);

  return { state, onLot, ghost, hover, roadPath: shownPath, grid, selectSlot, pickBuilding, hint };
}

/** One line telling the admin what a click does right now. */
function editorHint(s: EditorState, hovered: CityObject | undefined, ghost: GhostSpec | null, roadStarted: boolean): string {
  const fit = ghost?.fit;
  const bad = fit && !fit.ok ? `${fit.reason} · ` : "";
  if (s.held) {
    const o = s.objects.get(s.held);
    const tail = o?.kind === "building" ? "drop on a building to swap · R rotate · Esc put back" : "R rotate · Delete remove · Esc put back";
    return `${bad}Click to drop ${nameOf(o)} · ${tail}`;
  }
  switch (s.tool.kind) {
    case "bulldoze":
      if (hovered?.kind === "building") return "Delete: buildings stay. Remove people in Settings";
      return hovered ? `Click to delete ${nameOf(hovered)} · Del to stop` : "Delete: click an item to remove it · Del to stop";
    case "road":
      if (roadStarted) return "Click where the road ends · Esc to cancel";
      if (fit?.ok && fit.replaces) return `Road: click where it starts · replaces ${nameOf(fit.replaces)}`;
      return `${bad}Road: click where it starts, then where it ends`;
    case "place":
      if (fit?.ok && fit.replaces) return `Click to replace ${nameOf(fit.replaces)} · Esc to stop`;
      return isSurface(s.tool.item)
        ? `${bad}Click a lot to place · Esc to stop`
        : `${bad}Click to place · R rotate · Shift no snap · Esc to stop`;
    default:
      return hovered
        ? `Click to pick up ${nameOf(hovered)} · right-click to delete`
        : "Click something to move it · 1–9 pick an item";
  }
}
