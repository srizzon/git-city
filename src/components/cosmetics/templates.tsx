"use client";

import type { ReactNode } from "react";
import {
  NeonOutline,
  ParticleAura,
  SpotlightEffect,
  NeonTrim,
  HologramRing,
  LightningAura,
} from "@/components/BuildingEffects";
import type { BuildingVisualOpts } from "./itemRenderers";

// ─── Parametric effect templates ──────────────────────────────────────────
// A template turns one effect into many cosmetics via params. The headline win
// for scale: recolors. "outline + {color:#ff0}" and "outline + {color:#0ff}"
// are two catalog rows over ONE template — no new component each time, which is
// exactly how Fortnite/Roblox ship hundreds of variants cheaply.
//
// Each template reads its params and the building dims; `color` defaults to the
// building accent so an un-parameterised template still looks intentional.

type Params = Record<string, unknown>;

function color(params: Params, opts: BuildingVisualOpts): string | undefined {
  const c = params.color;
  return typeof c === "string" ? c : opts.color;
}

export const TEMPLATE_RENDERERS: Record<string, (opts: BuildingVisualOpts, params: Params) => ReactNode> = {
  outline: (o, p) => <NeonOutline width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  trim: (o, p) => <NeonTrim width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  particles: (o, p) => <ParticleAura width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  ring: (o, p) => <HologramRing width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  spotlight: (o, p) => <SpotlightEffect width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  lightning: (o, p) => <LightningAura width={o.width} height={o.height} depth={o.depth} color={color(p, o)} />,
  // "tint" recolors the building face itself (no overlay mesh) — same contract
  // as the legacy custom_color: the face colour is applied by the caller.
  tint: () => null,
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_RENDERERS);

export function renderTemplate(template: string, opts: BuildingVisualOpts, params: Params = {}): ReactNode {
  const fn = TEMPLATE_RENDERERS[template];
  return fn ? fn(opts, params) : null;
}
