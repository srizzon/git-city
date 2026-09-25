// ─── Object props ───────────────────────────────────────────
// One zod schema per item type that carries settings (league_objects.props).
// Shared by the editor (inline errors) and the ops route, which rejects bad
// props before calling apply_league_city_ops. Types without a schema take no
// props. SQL only caps the size (2 KB).

import { z } from "zod";
import { checkProfanity, type Language } from "glin-profanity";
import type { CityOp, ItemType, ObjectProps } from "./types";

/** LED text colors and backgrounds for planes and blimps. */
export const SKY_TEXT_COLORS = ["#c8e64a", "#ffffff", "#ffd23f", "#ff6b6b", "#4ad8ff", "#ff7ad9"] as const;
export const SKY_BG_COLORS = ["#0b0f19", "#1a2a6c", "#3b0a45", "#0f3d2e", "#4a1010"] as const;

export const MESSAGE_MAX = 80;
export const ORBIT_MIN = 60;
export const ORBIT_MAX = 600;
export const ALT_MIN = 80;
export const ALT_MAX = 320;

const LANGUAGES: Language[] = ["english", "portuguese", "spanish"];
const LINK_RE = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|dev|app|xyz|co|gg|ly|me|br|ai|sh|so|to|tv)\b)/i;

/** Why a sky message can't be used, or null. */
export function messageProblem(text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return "Write a message.";
  if (t.length > MESSAGE_MAX) return `Keep it under ${MESSAGE_MAX} characters.`;
  if (LINK_RE.test(t)) return "No links in messages.";
  if (checkProfanity(t, { languages: LANGUAGES, detectLeetspeak: true }).containsProfanity) return "Pick different words.";
  return null;
}

const message = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim())
  .superRefine((s, ctx) => {
    const p = messageProblem(s);
    if (p) ctx.addIssue({ code: "custom", message: p });
  });

const sky = {
  text: message,
  color: z.enum(SKY_TEXT_COLORS),
  bg: z.enum(SKY_BG_COLORS),
  alt: z.number().int().min(ALT_MIN).max(ALT_MAX),
};

export const PROPS_SCHEMAS: Partial<Record<ItemType, z.ZodType<ObjectProps>>> = {
  plaza: z.strictObject({ logo_floor: z.boolean().optional() }),
  plane: z.strictObject({ ...sky, orbit: z.number().int().min(ORBIT_MIN).max(ORBIT_MAX) }),
  blimp: z.strictObject(sky),
};

export const DEFAULT_PROPS: Partial<Record<ItemType, ObjectProps>> = {
  plane: { text: "Welcome to town", color: SKY_TEXT_COLORS[0], bg: SKY_BG_COLORS[0], alt: 140, orbit: 220 },
  blimp: { text: "Welcome to town", color: SKY_TEXT_COLORS[0], bg: SKY_BG_COLORS[0], alt: 200 },
};

export type PropsResult = { ok: true; props: ObjectProps | null } | { ok: false; message: string };

/** Validates props for a type. Types without a schema accept only none. */
export function parseProps(t: ItemType, props: unknown): PropsResult {
  const schema = PROPS_SCHEMAS[t];
  if (props === undefined || props === null) {
    if (!schema) return { ok: true, props: null };
    const r = schema.safeParse({});
    return r.success ? { ok: true, props: r.data } : { ok: false, message: r.error.issues[0]?.message ?? "Missing settings." };
  }
  if (!schema) return { ok: false, message: "That item has no settings." };
  const r = schema.safeParse(props);
  return r.success ? { ok: true, props: r.data } : { ok: false, message: r.error.issues[0]?.message ?? "Invalid settings." };
}

/**
 * Validates every op's props in a batch, with the item type from the op or,
 * for set_props, from the city. Returns the batch with cleaned props, or the
 * first problem.
 */
export function cleanOpsProps(
  ops: readonly CityOp[],
  typeOf: (id: string) => ItemType | null | undefined,
): { ok: true; ops: CityOp[] } | { ok: false; message: string } {
  const placed = new Map<string, ItemType>();
  const out: CityOp[] = [];
  for (const op of ops) {
    if (op.op === "place" && op.kind === "item") {
      if (op.id) placed.set(op.id, op.item_type);
      const r = parseProps(op.item_type, op.props);
      if (!r.ok) return r;
      const props = r.props && Object.keys(r.props).length > 0 ? r.props : undefined;
      out.push({ ...op, props } as CityOp);
    } else if (op.op === "set_props") {
      const t = placed.get(op.id) ?? typeOf(op.id);
      if (!t) return { ok: false, message: "That object is gone. Reload the city." };
      const r = parseProps(t, op.props);
      if (!r.ok) return r;
      out.push({ ...op, props: r.props ?? {} });
    } else out.push(op);
  }
  return { ok: true, ops: out };
}
