"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Howl } from "howler";
import type { CarApi } from "./Car";
import type { BotTargets } from "./RemoteCars";
import type { BattleEvent, CarFeed, RemoteDriver } from "./useDrivePresence";
import type { SmashStore } from "@/lib/league-city/smash";
import { CHASSIS, M_TO_UNIT, UNIT_TO_M } from "@/lib/league-city/drive/tuning";
import { INTERP_MS, SnapshotBuffer, emptySnapshot, type CarSnapshot, type ClientMsg } from "@/lib/league-city/drive/net";
import { carHeading } from "@/lib/league-city/drive/vehicle";
import { HEIST, KIT, RULES, gameCops, inRing, starsFor, stepPush, type HeistFlash, type HeistSide, type HeistView, type KitItem, type KitSlot, type Ring } from "@/lib/towns/heist";

// ─── City of the day, in the car ────────────────────────────
// Everything the Brasil map's cops and robbers need on your screen; the
// drive room (party/heist.ts) has the last word on what pays.
//   robber    hearts (cop hits, turret shots, blasts and the cops' weapons
//             take one), stars from the buildings you hold, game cop cars
//             after you (fewer for each real cop in the room), turrets on the
//             tallest buildings near you from RULES.turretStars, the push bar
//             once you're out of the ring; out of hearts you're busted and
//             start again outside the city
//   cop       a game-run gang to chase while no real robber is here, your
//             busts, the magnet's target
//   kit       Q E F (1–6 are reactions): bomb and missile go through the
//             battle's own fx; duck, magnet and blue screen are drawn here
// Game-run cars are town-bot feeds (RemoteCars draws them, with bodies you
// can hit and blasts that wreck them), driven by a small pursuit sim here.

export interface HeistApi {
  /** Your car touched a remote car or bot. */
  contact: (id: string) => void;
  /** A real driver bumped you. */
  bumped: (from: string) => void;
  /** A blast threw your car. */
  knocked: () => void;
  /** A kit key, from the keyboard or the phone's buttons. */
  use: (key: KitSlot["key"]) => void;
}

export interface HeistDriveProps {
  ring: Ring;
  side: HeistSide | null;
  resident: boolean;
  /** Signed in: you can pick a side and play. */
  signedIn: boolean;
  /** Busts you already have today (the site's count). */
  busts: number;
  /** City standing share (the site's). */
  standing: number;
  cityName: string;
  onView: (v: HeistView | null) => void;
  /** At the ring with no side: the HUD asks. */
  onNeedSide: (need: boolean) => void;
}

const SIDE_COLOR: Record<HeistSide, string> = { robber: "#ff5a52", cop: "#5aa0ff" };
const COP_COLOR = "#f2f4ff";
const GANG_COLOR = "#3a1c1c";
/** Game cars' pace (m/s): cops a bit slower than your top speed, so you can get away. */
const COP_SPEED = 23;
const COP_TURN = 2.2;
const GANG_SPEED = 17;
/** How close (m) a game car has to be to hit you, and how often one can. */
const RAM_REACH = 4.2;
const RAM_EVERY_MS = 1400;
const SHOT_SPEED = 42;
const SHOT_LIFE = 3;
const SHOT_HIT = 2.6;
const TETHER_PULL = 14;

interface Npc {
  id: string;
  x: number;
  z: number;
  h: number;
  v: number;
  /** Gang: where it's headed and its hearts. */
  goal?: { x: number; z: number };
  hearts?: number;
  /** Slowed (blue screen) or held (magnet) until (ms). */
  slowUntil?: number;
  pulledUntil?: number;
  lastRam: number;
  buffer: SnapshotBuffer;
}

interface Shot {
  /** The building that fired it (its owner's login). */
  from: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
}

const quatY = (h: number, s: CarSnapshot) => {
  s.qx = 0;
  s.qy = Math.sin(h / 2);
  s.qz = 0;
  s.qw = Math.cos(h / 2);
};

function feedOf(n: Npc, color: string, badge: "cop" | "robber"): CarFeed {
  return { id: n.id, name: n.id, color, bot: true, badge, buffer: n.buffer };
}

function npcAt(id: string, x: number, z: number, h: number): Npc {
  return { id, x, z, h, v: 0, lastRam: 0, buffer: new SnapshotBuffer() };
}

/** Turn toward (tx, tz) and drive at `speed`, as a car would (no strafing). */
function steer(n: Npc, tx: number, tz: number, speed: number, dt: number) {
  const want = Math.atan2(tx - n.x, tz - n.z);
  let d = want - n.h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  n.h += Math.max(-COP_TURN * dt, Math.min(COP_TURN * dt, d));
  // Slow down in a hard turn.
  const target = speed * (Math.abs(d) > 1.2 ? 0.55 : 1);
  n.v += Math.max(-14 * dt, Math.min(9 * dt, target - n.v));
  n.x += Math.sin(n.h) * n.v * dt;
  n.z += Math.cos(n.h) * n.v * dt;
}

function record(n: Npc, now: number) {
  const s = emptySnapshot();
  s.x = n.x;
  s.y = 0.6;
  s.z = n.z;
  quatY(n.h, s);
  s.speed = n.v;
  n.buffer.push(now, s);
}

export default function HeistMode({
  heist,
  car,
  remotes,
  sides,
  send,
  selfId,
  store,
  botTargets,
  sinkRef,
  apiRef,
  onFeeds,
  muted,
}: {
  heist: HeistDriveProps;
  car: React.MutableRefObject<CarApi | null>;
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  /** Every driver's side, from the room. */
  sides: React.MutableRefObject<Map<string, HeistSide>>;
  send: (msg: ClientMsg) => void;
  selfId: React.MutableRefObject<string | null>;
  store?: SmashStore;
  botTargets: BotTargets;
  /** The room's heist messages and the kit's own fx come in here. */
  sinkRef: React.MutableRefObject<(e: BattleEvent | ({ t: string } & Record<string, unknown>)) => void>;
  apiRef: React.MutableRefObject<HeistApi | null>;
  /** The game-run cars to draw (RemoteCars). */
  onFeeds: (feeds: CarFeed[]) => void;
  muted: boolean;
}) {
  const props = useRef(heist);
  useEffect(() => {
    props.current = heist;
  }, [heist]);
  const side = heist.side;
  const silent = useRef(muted);
  useEffect(() => {
    silent.current = muted;
  }, [muted]);

  // Robber
  const held = useRef(0);
  const hearts = useRef<number>(HEIST.hearts);
  const push = useRef({ held: 0 });
  const pushAsked = useRef(0);
  const lastCop = useRef<{ id: string; at: number } | null>(null);
  /** The building whose shot hit you last (its owner's login), for the bust. */
  const lastTurret = useRef<{ login: string; at: number } | null>(null);
  const lastHit = useRef(0);
  // Cop
  const busts = useRef(heist.busts);
  useEffect(() => {
    busts.current = Math.max(busts.current, heist.busts);
  }, [heist.busts]);
  // Both
  const kitAt = useRef(new Map<KitItem, number>());
  const flash = useRef<{ f: HeistFlash; until: number } | null>(null);
  const npcs = useRef<Npc[]>([]);
  const shots = useRef<Shot[]>([]);
  const lastShot = useRef(new Map<number, number>());
  const duck = useRef<{ x: number; z: number; until: number; mine: boolean }[]>([]);
  const tether = useRef<{ from: string; until: number } | null>(null);
  const myTether = useRef<{ to: string; until: number } | null>(null);
  const lastView = useRef("");
  const lastViewAt = useRef(0);
  const needSide = useRef(false);
  const [ducks, setDucks] = useState<{ x: number; z: number; key: number }[]>([]);
  const ding = useRef<Howl | null>(null);

  useEffect(() => {
    ding.current = new Howl({ src: ["/sounds/drive/impact.ogg"], volume: 0.5 });
    return () => {
      ding.current?.unload();
      onFeedsRef.current([]);
    };
  }, []);
  const onFeedsRef = useRef(onFeeds);
  useEffect(() => {
    onFeedsRef.current = onFeeds;
  }, [onFeeds]);

  const myPos = () => {
    const c = car.current;
    if (!c) return null;
    const p = c.body.translation();
    return { x: p.x, z: p.z };
  };

  /** Real drivers on a side, with where they are now. */
  const realOn = (s: HeistSide) => {
    const out: { id: string; x: number; z: number }[] = [];
    for (const [id, sd] of sides.current) {
      if (sd !== s || id === selfId.current) continue;
      const r = remotes.current.get(id)?.buffer.latest;
      if (r) out.push({ id, x: r.x, z: r.z });
    }
    return out;
  };

  const setFlash = (f: HeistFlash, ms: number) => {
    flash.current = { f, until: performance.now() + ms };
  };

  const resetRun = () => {
    held.current = 0;
    hearts.current = HEIST.hearts;
    push.current.held = 0;
    lastCop.current = null;
  };

  /** Out of hearts: the room drops what you held, and you start again outside the city. */
  const busted = () => {
    const c = car.current;
    const ring = props.current.ring;
    const now = performance.now();
    const by = lastCop.current && now - lastCop.current.at < RULES.bustCreditMs ? lastCop.current.id : undefined;
    const turret = !by && lastTurret.current && now - lastTurret.current.at < 500 ? lastTurret.current.login : undefined;
    send({ t: "heist_bust", ...(by ? { by } : turret ? { turret } : {}) });
    const lost = held.current;
    setFlash({ kind: "busted", pts: lost * HEIST.building, by: by ? (remotes.current.get(by)?.name ?? null) : null }, 2600);
    resetRun();
    npcs.current = npcs.current.filter((n) => !n.id.startsWith("bot:heist-cop"));
    shots.current = [];
    if (c) {
      const p = c.body.translation();
      const d = Math.hypot(p.x - ring.x, p.z - ring.z) || 1;
      const k = (ring.r + 30) / d;
      const x = ring.x + (p.x - ring.x) * k;
      const z = ring.z + (p.z - ring.z) * k;
      const h = Math.atan2(x - ring.x, z - ring.z);
      c.body.setTranslation({ x, y: 1.2, z }, true);
      c.body.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  };

  /** A hit on a robber: one heart; `cop` names a real cop for the bust. */
  const hurt = (cop?: string) => {
    if (props.current.side !== "robber") return;
    const now = performance.now();
    if (cop) lastCop.current = { id: cop, at: now };
    if (now - lastHit.current < 700) return;
    lastHit.current = now;
    hearts.current = Math.max(0, hearts.current - 1);
    if (!silent.current) ding.current?.play();
    if (hearts.current === 0) busted();
  };

  const kitSlots = (now: number): KitSlot[] | null => {
    const s = props.current.side;
    if (!s) return null;
    return KIT[s].map((item, i) => {
      const left = Math.max(0, (kitAt.current.get(item) ?? -Infinity) + RULES.kitMs[item] - now);
      return { item, key: (["Q", "E", "F"] as const)[i], charging: left > 0 ? left / RULES.kitMs[item] : 0, secs: Math.ceil(left / 1000) };
    });
  };

  const kitActive = () => {
    const p = myPos();
    const { ring, side: s } = props.current;
    return !!s && !!p && Math.hypot(p.x - ring.x, p.z - ring.z) <= ring.r * RULES.kitReach;
  };

  /** The nearest target ahead within `reach` (m): real robbers, or the gang when there are none. */
  const aim = (reach: number) => {
    const c = car.current;
    if (!c) return null;
    const p = c.body.translation();
    const h = carHeading(c.body);
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const pool = [...realOn("robber"), ...npcs.current.filter((n) => n.id.startsWith("bot:heist-gang")).map((n) => ({ id: n.id, x: n.x, z: n.z }))];
    let best: { id: string; x: number; z: number } | null = null;
    let bestD = reach;
    for (const t of pool) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 1) continue;
      if ((dx * fx + dz * fz) / d < 0.4) continue;
      best = t;
      bestD = d;
    }
    return best;
  };

  const use = (key: KitSlot["key"]) => {
    const s = props.current.side;
    const c = car.current;
    if (!s || !c || !kitActive()) return;
    const item = KIT[s][["Q", "E", "F"].indexOf(key)];
    if (!item) return;
    const now = performance.now();
    if (now - (kitAt.current.get(item) ?? -Infinity) < RULES.kitMs[item]) return;
    kitAt.current.set(item, now);
    const p = c.body.translation();
    const h = carHeading(c.body);
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    // The bomb right behind you; the duck further back, past the camera, between you and whoever's after you.
    if (item === "bomb" || item === "duck") {
      const back = item === "duck" ? 14 : 4;
      send({ t: "use", kit: true, item, x: p.x - fx * back, z: p.z - fz * back, dx: fx, dz: fz });
    }
    else {
      const tgt = aim(item === "missile" ? 140 : 60);
      const real = tgt && !tgt.id.startsWith("bot:") ? tgt.id : undefined;
      send({ t: "use", kit: true, item, x: p.x + fx * 3.5, z: p.z + fz * 3.5, dx: fx, dz: fz, ...(real ? { target: real } : {}) });
      // The gang lives on this screen only: the magnet and the blue screen land here.
      if (tgt && !real && (item === "magnet" || item === "bluescreen")) {
        const n = npcs.current.find((x) => x.id === tgt.id);
        if (n && item === "magnet") n.pulledUntil = now + RULES.magnetMs;
        if (n && item === "bluescreen") n.slowUntil = now + RULES.bluescreenMs * 2;
        if (item === "magnet") myTether.current = { to: tgt.id, until: now + RULES.magnetMs };
      }
      if (real && item === "magnet") myTether.current = { to: real, until: now + RULES.magnetMs };
    }
  };

  apiRef.current = {
    contact: (id) => {
      const now = performance.now();
      const n = npcs.current.find((x) => x.id === id);
      if (n?.id.startsWith("bot:heist-cop")) {
        if (now - n.lastRam < RAM_EVERY_MS) return;
        n.lastRam = now;
        hurt();
      } else if (n?.id.startsWith("bot:heist-gang") && props.current.side === "cop") {
        const me = car.current?.body.linvel();
        if (!me || Math.hypot(me.x, me.z) < 6 || now - n.lastRam < 800) return;
        n.lastRam = now;
        n.hearts = (n.hearts ?? RULES.gangHearts) - 1;
        if (n.hearts <= 0) gangBusted(n);
      }
    },
    bumped: (from) => {
      if (sides.current.get(from) === "cop") hurt(from);
    },
    knocked: () => hurt(lastCop.current?.id),
    use,
  };

  const gangBusted = (n: Npc) => {
    send({ t: "heist_gang_bust" });
    botTargets.current.get(n.id)?.hit(0, 0, 30);
    // The room pays it (heist_bust_credit says so).
    npcs.current = npcs.current.filter((x) => x !== n);
    pushFeeds();
  };

  const pushFeeds = () => {
    onFeedsRef.current(npcs.current.map((n) => (n.id.startsWith("bot:heist-cop") ? feedOf(n, COP_COLOR, "cop") : feedOf(n, GANG_COLOR, "robber"))));
  };

  // Room messages and the kit's own fx.
  useEffect(() => {
    sinkRef.current = (e) => {
      const m = e as { t: string } & Record<string, unknown>;
      const now = performance.now();
      if (m.t === "heist_held") held.current = Number(m.n) || 0;
      else if (m.t === "heist_pushed") {
        setFlash({ kind: "pushed", pts: Number(m.pts) || 0 }, 2500);
        resetRun();
        npcs.current = npcs.current.filter((n) => !n.id.startsWith("bot:heist-cop"));
        shots.current = [];
        pushFeeds();
      } else if (m.t === "heist_push_no") push.current.held = 0;
      else if (m.t === "heist_bust_credit") {
        busts.current += 1;
        setFlash({ kind: "bust", pts: Number(m.pts) || 0 }, 1800);
      } else if (m.t === "fx") {
        const me = selfId.current;
        const target = typeof m.target === "string" ? m.target : null;
        if (m.item === "duck") {
          duck.current.push({ x: Number(m.x), z: Number(m.z), until: now + RULES.duckMs, mine: m.from === me });
          setDucks(duck.current.map((d, i) => ({ x: d.x, z: d.z, key: Math.round(d.until) + i })));
          setTimeout(() => {
            duck.current = duck.current.filter((d) => d.until > performance.now());
            setDucks(duck.current.map((d, i) => ({ x: d.x, z: d.z, key: Math.round(d.until) + i })));
          }, RULES.duckMs + 50);
        } else if (target && target === me && typeof m.from === "string") {
          if (m.item === "magnet") {
            tether.current = { from: m.from, until: now + RULES.magnetMs };
            hurt(m.from);
          } else if (m.item === "bluescreen") {
            lastCop.current = { id: m.from, at: now };
            setFlash({ kind: "bluescreen", by: remotes.current.get(m.from)?.name ?? null }, RULES.bluescreenMs);
          }
        }
      }
    };
    return () => {
      sinkRef.current = () => {};
    };
    // Refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinkRef]);

  // Keyboard: Q E F while the kit is live.
  useEffect(() => {
    if (!side) return;
    const on = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const key = e.code === "KeyQ" ? "Q" : e.code === "KeyE" ? "E" : e.code === "KeyF" ? "F" : null;
      if (!key || !kitActive()) return;
      e.preventDefault();
      apiRef.current?.use(key);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  // Turret candidates: buildings with their height (m), from the smash store.
  const towers = useMemo(() => (store ? store.targets.map((t, i) => ({ i, x: t.x * UNIT_TO_M, z: t.z * UNIT_TO_M, h: t.floors * t.floorH * UNIT_TO_M })) : []), [store]);

  const shotMesh = useRef<THREE.InstancedMesh>(null);
  const _m = useMemo(() => new THREE.Matrix4(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.1, dtRaw);
    const c = car.current;
    const P = props.current;
    const now = performance.now();
    if (!c) return;
    const p = c.body.translation();
    const v = c.body.linvel();
    const inside = inRing(P.ring, p.x, p.z);
    const near = Math.hypot(p.x - P.ring.x, p.z - P.ring.z) <= P.ring.r + 6;

    // No side yet: the car waits at the ring for one.
    const need = P.signedIn && !P.side && near;
    if (need !== needSide.current) {
      needSide.current = need;
      P.onNeedSide(need);
    }
    if (need) {
      c.body.setLinvel({ x: v.x * 0.8, y: v.y, z: v.z * 0.8 }, true);
    }

    // Pulled by a cop's magnet.
    const tt = tether.current;
    if (tt && now < tt.until) {
      const r = remotes.current.get(tt.from)?.buffer.latest;
      if (r) {
        const dx = r.x - p.x;
        const dz = r.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > 5) c.body.applyImpulse({ x: (dx / d) * TETHER_PULL * CHASSIS.mass * dt, y: 0, z: (dz / d) * TETHER_PULL * CHASSIS.mass * dt }, true);
      }
    } else if (tt) tether.current = null;

    const stars = P.side === "robber" ? starsFor(held.current) : 0;
    const realCops = realOn("cop");
    const realRobbers = realOn("robber");
    let feedsChanged = false;

    // Game cops after a robber with stars.
    const copsWanted = P.side === "robber" ? gameCops(stars, realCops.length) : 0;
    const cops = npcs.current.filter((n) => n.id.startsWith("bot:heist-cop"));
    if (cops.length < copsWanted) {
      const h = carHeading(c.body);
      const i = cops.length;
      const back = 70 + i * 12;
      const side = (i % 2 ? 1 : -1) * 18;
      const n = npcAt(`bot:heist-cop-${i}`, p.x - Math.sin(h) * back + Math.cos(h) * side, p.z - Math.cos(h) * back - Math.sin(h) * side, h);
      npcs.current.push(n);
      feedsChanged = true;
    } else if (cops.length > copsWanted) {
      npcs.current = npcs.current.filter((n) => !n.id.startsWith("bot:heist-cop") || Number(n.id.slice(-1)) < copsWanted);
      feedsChanged = true;
    }

    // A gang for a lone cop.
    const gangWanted = P.side === "cop" && realRobbers.length === 0 ? RULES.gangCars : 0;
    const gang = npcs.current.filter((n) => n.id.startsWith("bot:heist-gang"));
    if (gang.length < gangWanted) {
      const a = Math.random() * Math.PI * 2;
      const n = npcAt(`bot:heist-gang-${Math.floor(Math.random() * 1e6)}`, P.ring.x + Math.sin(a) * P.ring.r * 0.6, P.ring.z + Math.cos(a) * P.ring.r * 0.6, a + Math.PI);
      n.hearts = RULES.gangHearts;
      npcs.current.push(n);
      feedsChanged = true;
    } else if (gang.length > gangWanted) {
      npcs.current = npcs.current.filter((n) => !n.id.startsWith("bot:heist-gang"));
      feedsChanged = true;
    }

    const activeDuck = duck.current.find((d) => d.mine && d.until > now);
    for (const n of npcs.current) {
      const body = botTargets.current.get(n.id)?.pos();
      // Knocked loose or wrecked: the sim waits where the body is.
      if (body) {
        n.x += (body.x - n.x) * Math.min(1, dt * 2);
        n.z += (body.z - n.z) * Math.min(1, dt * 2);
      }
      const slow = (n.slowUntil ?? 0) > now ? 0.35 : 1;
      if (n.id.startsWith("bot:heist-cop")) {
        // Pursuit: where you'll be in a moment, or the duck.
        const tx = activeDuck ? activeDuck.x : p.x + v.x * 0.6;
        const tz = activeDuck ? activeDuck.z : p.z + v.z * 0.6;
        steer(n, tx, tz, COP_SPEED * slow, dt);
      } else {
        // The gang roams the city and runs from you.
        const dx = n.x - p.x;
        const dz = n.z - p.z;
        const d = Math.hypot(dx, dz);
        if ((n.pulledUntil ?? 0) > now) {
          steer(n, p.x, p.z, 10, dt);
        } else if (d < 45) steer(n, n.x + (dx / (d || 1)) * 30, n.z + (dz / (d || 1)) * 30, GANG_SPEED * slow, dt);
        else {
          if (!n.goal || Math.hypot(n.goal.x - n.x, n.goal.z - n.z) < 8) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * P.ring.r * 0.8;
            n.goal = { x: P.ring.x + Math.sin(a) * r, z: P.ring.z + Math.cos(a) * r };
          }
          steer(n, n.goal.x, n.goal.z, GANG_SPEED * 0.7 * slow, dt);
        }
      }
      record(n, now);
      // A cop car that reaches you rams (Rapier's contact tells `contact`; this catches a near miss at speed).
      if (n.id.startsWith("bot:heist-cop") && Math.hypot(n.x - p.x, n.z - p.z) < RAM_REACH && now - n.lastRam > RAM_EVERY_MS) {
        n.lastRam = now;
        hurt();
      }
    }
    if (feedsChanged) pushFeeds();

    // Turrets: the tallest standing buildings near a wanted robber shoot where you're going.
    if (P.side === "robber" && stars >= RULES.turretStars && store) {
      const near = towers.filter((t) => Math.hypot(t.x - p.x, t.z - p.z) < RULES.turretReach && !store.isRubble(t.i, Date.now()));
      near.sort((a, b) => b.h - a.h);
      for (const t of near.slice(0, RULES.turrets)) {
        if (now - (lastShot.current.get(t.i) ?? -Infinity) < RULES.turretEveryMs) continue;
        lastShot.current.set(t.i, now);
        const aimX = activeDuck ? activeDuck.x : p.x + v.x * 0.5;
        const aimZ = activeDuck ? activeDuck.z : p.z + v.z * 0.5;
        const dx = aimX - t.x;
        const dz = aimZ - t.z;
        const dy = 1 - t.h;
        const d = Math.hypot(dx, dy, dz) || 1;
        shots.current.push({ from: store.targets[t.i].login, x: t.x, y: t.h, z: t.z, vx: (dx / d) * SHOT_SPEED, vy: (dy / d) * SHOT_SPEED, vz: (dz / d) * SHOT_SPEED, born: now });
      }
    }
    shots.current = shots.current.filter((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (now - s.born > SHOT_LIFE * 1000 || s.y < -1) return false;
      if (Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z) < SHOT_HIT) {
        c.body.applyImpulse({ x: s.vx * 0.08 * CHASSIS.mass, y: 2 * CHASSIS.mass, z: s.vz * 0.08 * CHASSIS.mass }, true);
        lastTurret.current = { login: s.from, at: now };
        hurt();
        return false;
      }
      return true;
    });
    const mesh = shotMesh.current;
    if (mesh) {
      mesh.count = Math.min(shots.current.length, 24);
      for (let i = 0; i < mesh.count; i++) {
        const s = shots.current[i];
        _m.makeTranslation(s.x * M_TO_UNIT, s.y * M_TO_UNIT, s.z * M_TO_UNIT);
        mesh.setMatrixAt(i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Push: out of the ring with buildings held and no cop near.
    let copClose = false;
    if (P.side === "robber") {
      for (const n of npcs.current) if (n.id.startsWith("bot:heist-cop") && Math.hypot(n.x - p.x, n.z - p.z) < RULES.copNear) copClose = true;
      for (const r of realCops) if (Math.hypot(r.x - p.x, r.z - p.z) < RULES.copNear) copClose = true;
      const filled = stepPush(push.current, dt * 1000, !inside, copClose, held.current);
      if ((filled || push.current.held >= HEIST.pushSecs * 1000) && now - pushAsked.current > 1500 && held.current > 0) {
        pushAsked.current = now;
        send({ t: "heist_push" });
      }
    }

    // The HUD, a few times a second.
    if (now - lastViewAt.current < 120) return;
    lastViewAt.current = now;
    const f = flash.current && flash.current.until > now ? flash.current.f : null;
    const pushing = P.side === "robber" && !inside && held.current > 0;
    const target = P.side === "cop" ? aim(60) : null;
    const view: HeistView = {
      city: { name: P.cityName, uf: "", buildings: 0, standing: P.standing },
      side: P.side,
      resident: P.resident,
      robber:
        P.side === "robber"
          ? {
              unpushed: held.current * HEIST.building,
              stars,
              hearts: hearts.current,
              inside,
              push: pushing ? { secsLeft: Math.max(0, Math.ceil(HEIST.pushSecs - push.current.held / 1000)), done: push.current.held / (HEIST.pushSecs * 1000), paused: copClose } : null,
            }
          : null,
      cop: P.side === "cop" ? { busts: busts.current, target: target ? (target.id.startsWith("bot:") ? "gangue" : (remotes.current.get(target.id)?.name ?? null)) : null } : null,
      kit: kitActive() ? kitSlots(now) : null,
      flash: f,
    };
    const key = JSON.stringify(view);
    if (key !== lastView.current) {
      lastView.current = key;
      P.onView(view);
    }
  });

  return (
    <>
      <instancedMesh ref={shotMesh} args={[undefined, undefined, 24]} frustumCulled={false}>
        <boxGeometry args={[1.6, 1.6, 1.6]} />
        <meshStandardMaterial color="#ff5a52" emissive="#ff3b30" emissiveIntensity={2.2} toneMapped={false} />
      </instancedMesh>
      <HeistRing ring={heist.ring} />
      {ducks.map((d) => (
        <Duck key={d.key} x={d.x} z={d.z} />
      ))}
      <Tether from={myTether} car={car} remotes={remotes} npcs={npcs} />
    </>
  );
}

/** The city's edge: a dashed lime ring on the ground. */
function HeistRing({ ring }: { ring: Ring }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(48, Math.min(240, Math.round((ring.r * 2 * Math.PI) / 9)));
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      o.position.set((ring.x + Math.sin(a) * ring.r) * M_TO_UNIT, 0.35, (ring.z + Math.cos(a) * ring.r) * M_TO_UNIT);
      o.rotation.set(0, a + Math.PI / 2, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [ring, n]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[(ring.r * 2 * Math.PI * M_TO_UNIT) / n / 2, 0.5, 2.2]} />
      <meshStandardMaterial color="#c8e64a" emissive="#c8e64a" emissiveIntensity={1.4} toneMapped={false} />
    </instancedMesh>
  );
}

/** A giant rubber duck (the robber's decoy), voxel style. */
function Duck({ x, z }: { x: number; z: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.y = clock.elapsedTime * 1.5;
  });
  return (
    <group ref={g} position={[x * M_TO_UNIT, 0, z * M_TO_UNIT]}>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[7, 5, 9]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ffb400" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 7.5, 3]}>
        <boxGeometry args={[4.5, 4.5, 4.5]} />
        <meshStandardMaterial color="#ffd23f" emissive="#ffb400" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 7, 6]}>
        <boxGeometry args={[2.4, 1.2, 2]} />
        <meshStandardMaterial color="#ff9a3c" emissive="#ff7a1a" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[1.4, 8.3, 4.6]}>
        <boxGeometry args={[0.8, 0.8, 0.4]} />
        <meshStandardMaterial color="#0d0d0f" />
      </mesh>
      <mesh position={[-1.4, 8.3, 4.6]}>
        <boxGeometry args={[0.8, 0.8, 0.4]} />
        <meshStandardMaterial color="#0d0d0f" />
      </mesh>
    </group>
  );
}

/** The magnet's cable, from your car to what it caught. */
function Tether({
  from,
  car,
  remotes,
  npcs,
}: {
  from: React.MutableRefObject<{ to: string; until: number } | null>;
  car: React.MutableRefObject<CarApi | null>;
  remotes: React.MutableRefObject<Map<string, RemoteDriver>>;
  npcs: React.MutableRefObject<Npc[]>;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const snap = useRef(emptySnapshot());
  const _a = useMemo(() => new THREE.Vector3(), []);
  const _b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = mesh.current;
    const t = from.current;
    const c = car.current;
    if (!m) return;
    m.visible = false;
    if (!t || !c || performance.now() > t.until) return;
    let other: { x: number; z: number } | null = null;
    const n = npcs.current.find((x) => x.id === t.to);
    if (n) other = n;
    else {
      const s = remotes.current.get(t.to)?.buffer.sample(performance.now() - INTERP_MS, snap.current);
      if (s) other = s;
    }
    if (!other) return;
    _a.copy(c.group.position).setY(2.5);
    _b.set(other.x * M_TO_UNIT, 2.5, other.z * M_TO_UNIT);
    const len = _a.distanceTo(_b);
    m.position.copy(_a).lerp(_b, 0.5);
    m.lookAt(_b);
    m.scale.set(1, 1, len);
    m.visible = true;
  });
  return (
    <mesh ref={mesh} visible={false}>
      <boxGeometry args={[0.5, 0.5, 1]} />
      <meshStandardMaterial color="#5aa0ff" emissive="#5aa0ff" emissiveIntensity={2} toneMapped={false} />
    </mesh>
  );
}

/** A cop's light bar on the roof, red and blue taking turns. */
export function LightBar() {
  const red = useRef<THREE.MeshStandardMaterial>(null);
  const blue = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const on = Math.floor(clock.elapsedTime * 6) % 2 === 0;
    if (red.current) red.current.emissiveIntensity = on ? 3 : 0.2;
    if (blue.current) blue.current.emissiveIntensity = on ? 0.2 : 3;
  });
  return (
    <group position={[0, 3.9, -0.4]}>
      <mesh position={[-0.9, 0, 0]}>
        <boxGeometry args={[1.6, 0.6, 0.8]} />
        <meshStandardMaterial ref={red} color="#ff3b30" emissive="#ff3b30" toneMapped={false} />
      </mesh>
      <mesh position={[0.9, 0, 0]}>
        <boxGeometry args={[1.6, 0.6, 0.8]} />
        <meshStandardMaterial ref={blue} color="#2f7bff" emissive="#2f7bff" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Over a robber: a red marker you can find from far. */
export function RobberMark() {
  return (
    <mesh position={[0, 9.5, 0]}>
      <octahedronGeometry args={[1.2, 0]} />
      <meshStandardMaterial color={SIDE_COLOR.robber} emissive={SIDE_COLOR.robber} emissiveIntensity={1.6} toneMapped={false} />
    </mesh>
  );
}
