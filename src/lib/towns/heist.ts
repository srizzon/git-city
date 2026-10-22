// ─── Brasil town: city of the day ───────────────────────────
// Cops and robbers on the Brasil map. Each day one city pays double for its
// buildings: robbers knock them down and keep the points only once they've
// pushed (left the city's ring and held out 5 s), cops bust robbers for points
// and get a bonus if the city ends the day mostly standing. Residents of the
// city are cops; anyone else picks a side for the day. What the HUD draws is
// a HeistView; the numbers here are the starting values, tuned by playing.
// Pure.

export const HEIST = {
  /** Points a building in the city of the day pays (double the map's). */
  building: 10,
  /** Smash points a robber can bank a day in the city of the day. */
  dayCap: 100,
  /** Seconds outside the ring with no cop near to push. */
  pushSecs: 5,
  /** A car's hearts; each hit costs one, zero is a bust. */
  hearts: 5,
  /** Points a bust pays the cop. */
  bust: 15,
  /** Share of the city's buildings standing at midnight for the cops' bonus. */
  standGoal: 0.7,
  /** The cops' bonus (each cop with a bust). */
  standBonus: 30,
} as const;

export type HeistSide = "robber" | "cop";
export type KitItem = "missile" | "duck" | "bomb" | "magnet" | "bluescreen";

/** One slot of a side's kit: ready, or charging with this many seconds left. */
export interface KitSlot {
  item: KitItem;
  /** Q and E for the side's own two, F for the missile (F is the attack key everywhere). */
  key: "Q" | "E" | "F";
  /** 0 when ready; otherwise 0…1 of the charge still to go. */
  charging: number;
  secs: number;
}

export const KIT: Record<HeistSide, KitItem[]> = {
  robber: ["duck", "bomb", "missile"],
  cop: ["magnet", "bluescreen", "missile"],
};

export const KIT_NAMES: Record<KitItem, [en: string, pt: string]> = {
  missile: ["Missile", "Míssil"],
  duck: ["Rubber duck", "Pato"],
  bomb: ["Bomb", "Bomba"],
  magnet: ["Magnet", "Ímã"],
  bluescreen: ["Blue screen", "Tela azul"],
};

export interface HeistCity {
  name: string;
  uf: string;
  buildings: number;
  /** Share standing now, 0…1. */
  standing: number;
}

export type HeistFlash = { kind: "pushed"; pts: number } | { kind: "busted"; pts: number; by: string | null } | { kind: "bluescreen"; by: string | null };

export interface HeistView {
  city: HeistCity;
  side: HeistSide | null;
  /** You live in the city: a cop without choosing. */
  resident: boolean;
  robber: { unpushed: number; stars: number; hearts: number; push: { secsLeft: number; done: number; paused: boolean } | null } | null;
  cop: { busts: number; target: string | null } | null;
  kit: KitSlot[] | null;
  flash: HeistFlash | null;
}

export interface HeistResult {
  city: HeistCity;
  /** Share standing at midnight. */
  standing: number;
  cops: { login: string; busts: number }[];
  robbers: { login: string; pts: number }[];
  you: { side: HeistSide; busts?: number; pts?: number; bonus?: number } | null;
}

/** The cops kept the city. */
export const defended = (standing: number) => standing >= HEIST.standGoal;
