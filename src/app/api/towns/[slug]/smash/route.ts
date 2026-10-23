import { NextResponse, after } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getDamage, getSmashTown, recordFalls, recordFloors, saveDamage, verifySmashSave, weekContribs } from "@/lib/league-city/smash-server";
import { isRevenge, notifyDemolished } from "@/lib/notification-senders/town-demolished";
import { captureServer } from "@/lib/posthog-server";
import { awardSmashPoints } from "@/lib/towns/brasil-points-server";
import { heistDay, knockHeist, payBusts, payPushes, recordTurretBusts } from "@/lib/towns/heist-server";

export const dynamic = "force-dynamic";

// GET: a town's smash state: its buildings as targets (for the drive
// room) and their saved damage (for everyone). ?contrib=1 only returns the
// damaged owners' contributions this week (the room grows floors back from
// them). On the Brasil map, `heist`: the city of the day's ring (meters), for
// the room to hold that city's falls until a push. Public: it's what anyone
// sees in the town.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  try {
    // ?heist=1: only the city of the day (the room checks it again through the day).
    if (new URL(req.url).searchParams.get("heist") === "1") {
      const day = league.map === "brasil" ? await heistDay(league.id).catch(() => null) : null;
      return NextResponse.json({ heist: day?.ring ? { day: day.day, key: day.key, ring: day.ring } : null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const town = await getSmashTown(league.id);
    const damage = await getDamage(league.id, town);
    if (new URL(req.url).searchParams.get("contrib") === "1") {
      const byId = await weekContribs(damage.map((d) => town.devIds[d.login]));
      const contrib = Object.fromEntries(damage.map((d) => [d.login, byId.get(town.devIds[d.login]) ?? 0]));
      return NextResponse.json({ contrib }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const day = league.map === "brasil" ? await heistDay(league.id).catch(() => null) : null;
    const heist = day?.ring ? { day: day.day, key: day.key, ring: day.ring } : null;
    return NextResponse.json(
      { targets: town.targets, damage, heist, now: Date.now() },
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
    );
  } catch (err) {
    console.error("[smash:read]", err);
    return NextResponse.json({ error: "Couldn't load the town's damage." }, { status: 500 });
  }
}

// POST: the drive room's save, signed (x-smash-signature). Writes the damaged
// buildings, the floors players knocked down (play points), the falls and,
// on the Brasil map, the points each fall pays, before answering (a failure
// makes the room resend); the emails to whoever's building just fell go out after.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.text();
  const save = verifySmashSave(slug, body, req.headers.get("x-smash-signature"));
  if (!save) return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  try {
    const town = await getSmashTown(league.id);
    await saveDamage(league.id, town, save);
    // Floors before falls: a failed floors write answers 500 before any new fall is
    // logged, so the room's retry still gets the demolition emails out.
    await recordFloors(town, save);
    const falls = await recordFalls(league.id, town, save);
    if (league.map === "brasil") {
      // A fall in the city of the day pays only when its robber pushes.
      const plain = falls.filter((f) => !f.day);
      if (plain.length) await awardSmashPoints(plain).catch((err) => console.error("[smash:points]", err));
      if (save.heist?.length) await payPushes(save.heist).catch((err) => console.error("[smash:heist]", err));
      if (save.busts?.length) await payBusts(save.busts).catch((err) => console.error("[smash:busts]", err));
      if (save.turrets?.length) await recordTurretBusts(town.devIds, save.turrets).catch((err) => console.error("[smash:turrets]", err));
      if (save.knocked) await knockHeist(save.knocked, save.at).catch((err) => console.error("[smash:knocked]", err));
    }
    if (falls.length) {
      after(async () => {
        for (const f of falls) {
          await captureServer(f.attacker.toLowerCase(), "town_building_knocked_down", {
            town_slug: league.slug,
            victim_login: f.victim.toLowerCase(),
            is_revenge: await isRevenge(f.attackerId, f.victimId).catch(() => false),
          });
        }
        for (const f of falls.slice(0, 20)) await notifyDemolished(league, f).catch((err) => console.error("[smash:email]", err));
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[smash:save]", err);
    return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  }
}
