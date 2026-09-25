import { levelFromXp, xpForLevel } from "../xp";
import { getSupabaseAdmin } from "../supabase";
import { getDiscover } from "../towns/discover";
import { EMAIL_BASE_URL, bulletList, button, heading, heroImage, label, statTiles, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface WeeklyRecapData {
  login: string;
  /** Monday of the recap week (YYYY-MM-DD); also busts the hero image cache. */
  weekKey: string;
  xpTotal: number;
  /** XP earned by playing this week (GitHub sync XP excluded). */
  xpThisWeek: number;
  streak: number;
  rank: number | null;
  visitors: number;
  kudos: number;
  raidsAgainst: number;
  raidsDefended: number;
  raidWins: number;
  emblems: string[];
  /** Attacker whose tag is still on the building, if any. */
  activeTagBy: string | null;
  townOfWeek: { name: string; slug: string } | null;
  newDevelopers: number;
}

const possessive = (login: string) => `@${login}${login.endsWith("s") ? "'" : "'s"}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${plural(names.length - 2, "more", "more")}`;
}

/** True when the week has something worth a recap. */
export function hasRecapNews(d: WeeklyRecapData): boolean {
  return d.xpThisWeek > 0 || d.streak > 0 || d.visitors > 0 || d.kudos > 0 || d.raidsAgainst > 0 || d.raidWins > 0 || d.emblems.length > 0;
}

export function recapHeader(d: WeeklyRecapData) {
  const level = levelFromXp(d.xpTotal);
  const xpToNext = xpForLevel(level + 1) - d.xpTotal;
  const parts = [d.xpThisWeek > 0 ? `+${d.xpThisWeek.toLocaleString("en-US")} XP` : null, d.streak > 0 ? `${d.streak}-day streak` : null].filter(Boolean);
  return {
    level,
    xpToNext,
    subject: parts.length ? `Your week: ${parts.join(", ")}` : "Your week in Git City",
    preheader: d.activeTagBy
      ? `${possessive(d.activeTagBy)} tag is still on your building. Here's your week.`
      : `${xpToNext.toLocaleString("en-US")} XP to level ${level + 1}. Here's your week.`,
  };
}

function weekEvents(d: WeeklyRecapData): { lead: string; text: string }[] {
  const events: { lead: string; text: string }[] = [];
  if (d.activeTagBy) events.push({ lead: "Still tagged.", text: `${possessive(d.activeTagBy)} tag is on your building until someone raids it off.` });
  if (d.raidsAgainst > 0) {
    events.push({
      lead: `Raided ${d.raidsAgainst === 1 ? "once" : `${d.raidsAgainst} times`}.`,
      text: d.raidsDefended > 0 ? `You held off ${d.raidsDefended === d.raidsAgainst ? "every attack" : plural(d.raidsDefended, "attack")}.` : d.raidsAgainst === 1 ? "It got through." : "All of them got through.",
    });
  }
  if (d.raidWins > 0) events.push({ lead: `${plural(d.raidWins, "raid")} won.`, text: "Your tag is out there." });
  if (d.emblems.length > 0) events.push({ lead: `${plural(d.emblems.length, "emblem")} earned:`, text: listNames(d.emblems) });
  if (d.visitors > 0) events.push({ lead: `${plural(d.visitors, "developer")}`, text: "stopped by your building." });
  if (d.kudos > 0) events.push({ lead: `${plural(d.kudos, "kudos", "kudos")}`, text: "from other developers." });
  return events.slice(0, 4);
}

export function renderWeeklyRecapEmail(d: WeeklyRecapData, links: EmailLinks) {
  const { level, xpToNext, subject, preheader } = recapHeader(d);
  const events = weekEvents(d);

  const city: { lead: string; text: string }[] = [];
  if (d.townOfWeek) city.push({ lead: "Town of the week:", text: d.townOfWeek.name });
  if (d.newDevelopers > 0) city.push({ lead: plural(d.newDevelopers, "new developer"), text: "moved in." });

  const cta = d.activeTagBy
    ? { text: `Raid @${d.activeTagBy} back`, url: trackedUrl(`/?user=${encodeURIComponent(d.activeTagBy)}`, "weekly_recap") }
    : d.streak > 0
      ? { text: `Keep your ${d.streak}-day streak`, url: trackedUrl("/", "weekly_recap") }
      : { text: "Visit your building", url: trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "weekly_recap") };

  const tiles = [
    { value: d.xpThisWeek > 0 ? `+${d.xpThisWeek.toLocaleString("en-US")}` : "0", label: "XP this week" },
    d.streak > 0
      ? { value: `${d.streak}d`, label: "Streak" }
      : { value: d.rank ? `#${d.rank.toLocaleString("en-US")}` : "–", label: "City rank" },
    { value: `Lvl ${level}`, label: `${xpToNext.toLocaleString("en-US")} XP to ${level + 1}` },
  ];

  const reason = "You're getting this weekly recap because you played Git City in the last 30 days.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/dev/${encodeURIComponent(d.login)}/opengraph-image?w=${d.weekKey}`,
      href: trackedUrl(`/?user=${encodeURIComponent(d.login)}`, "weekly_recap"),
      alt: `@${d.login}'s building in Git City, level ${level}`,
    }),
    body: [
      heading("Your week in the city,", `@${d.login}`),
      statTiles(tiles),
      events.length ? label("This week") + bulletList(events) : "",
      city.length ? label("Around the city") + bulletList(city) : "",
      button(cta.text, cta.url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      `Your week in the city, @${d.login}`,
      "",
      ...tiles.map((t) => `${t.label}: ${t.value}`),
      ...(events.length ? ["", "This week:", ...events.map((e) => `- ${e.lead} ${e.text}`)] : []),
      ...(city.length ? ["", "Around the city:", ...city.map((e) => `- ${e.lead} ${e.text}`)] : []),
      "",
      `${cta.text}: ${cta.url}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export interface RecapDev {
  id: number;
  github_login: string;
  app_streak: number | null;
  last_checkin_date: string | null;
  rank: number | null;
  xp_total: number | null;
}

export interface RecapContext {
  now: Date;
  townOfWeek: WeeklyRecapData["townOfWeek"];
  newDevelopers: number;
}

export const RECAP_DEV_COLUMNS = "id, github_login, app_streak, last_checkin_date, rank, xp_total";

/** City-wide lines for this week's recap, the same for everyone. */
export async function loadRecapContext(now = new Date()): Promise<RecapContext> {
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [discover, newDevs] = await Promise.all([
    getDiscover(null).catch(() => null),
    getSupabaseAdmin().from("developers").select("id", { count: "exact", head: true }).eq("claimed", true).gte("claimed_at", weekStart),
  ]);
  return {
    now,
    townOfWeek: discover?.featured ? { name: discover.featured.name, slug: discover.featured.slug } : null,
    newDevelopers: newDevs.count ?? 0,
  };
}

/** Last 7 days of activity for a page of developers, keyed by developer id. */
export async function loadWeeklyRecaps(devs: RecapDev[], ctx: RecapContext): Promise<Map<number, WeeklyRecapData>> {
  const sb = getSupabaseAdmin();
  const { now, townOfWeek, newDevelopers } = ctx;
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekStartDate = weekStart.split("T")[0];
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().split("T")[0];

  const devIds = devs.map((d) => d.id);

  const [xp, visits, kudos, raidsAgainst, raidWins, emblems, tags] = await Promise.all([
    // XP from playing; GitHub sync XP would make every new account look busy
    sb.from("xp_log").select("developer_id, amount").in("developer_id", devIds).neq("source", "github").gte("created_at", weekStart),
    sb.from("building_visits").select("building_id, visitor_id").in("building_id", devIds).gte("visit_date", weekStartDate),
    sb.from("developer_kudos").select("receiver_id").in("receiver_id", devIds).gte("given_date", weekStartDate),
    sb.from("raids").select("defender_id, success").in("defender_id", devIds).gte("created_at", weekStart),
    sb.from("raids").select("attacker_id").in("attacker_id", devIds).eq("success", true).gte("created_at", weekStart),
    sb.from("emblem_grants").select("developer_id, emblems(name)").in("developer_id", devIds).gte("first_earned_at", weekStart),
    sb.from("raid_tags").select("building_id, attacker_login").in("building_id", devIds).eq("active", true).gt("expires_at", now.toISOString()),
  ]);

  const count = <T,>(rows: T[] | null, key: (r: T) => number) => {
    const m = new Map<number, number>();
    for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return m;
  };
  const xpMap = new Map<number, number>();
  for (const r of xp.data ?? []) xpMap.set(r.developer_id, (xpMap.get(r.developer_id) ?? 0) + r.amount);
  // One visitor can come back on several days; count people, not visits
  const visitMap = new Map<number, number>();
  const seenVisits = new Set<string>();
  for (const r of visits.data ?? []) {
    const key = `${r.building_id}:${r.visitor_id}`;
    if (seenVisits.has(key)) continue;
    seenVisits.add(key);
    visitMap.set(r.building_id, (visitMap.get(r.building_id) ?? 0) + 1);
  }
  const kudosMap = count(kudos.data, (r) => r.receiver_id);
  const raidMap = count(raidsAgainst.data, (r) => r.defender_id);
  const defendedMap = count((raidsAgainst.data ?? []).filter((r) => !r.success), (r) => r.defender_id);
  const winMap = count(raidWins.data, (r) => r.attacker_id);
  const emblemMap = new Map<number, string[]>();
  for (const r of (emblems.data ?? []) as { developer_id: number; emblems: { name: string } | { name: string }[] | null }[]) {
    const name = Array.isArray(r.emblems) ? r.emblems[0]?.name : r.emblems?.name;
    if (name) emblemMap.set(r.developer_id, [...(emblemMap.get(r.developer_id) ?? []), name]);
  }
  const tagMap = new Map((tags.data ?? []).map((t) => [t.building_id, t.attacker_login]));

  const recaps = new Map<number, WeeklyRecapData>();
  for (const dev of devs) {
    // app_streak is only reset on the next check-in, so it's stale unless
    // the last check-in was today or yesterday.
    const streakIsCurrent = dev.last_checkin_date === today || dev.last_checkin_date === yesterday;

    recaps.set(dev.id, {
      login: dev.github_login,
      weekKey: weekStartDate,
      xpTotal: dev.xp_total ?? 0,
      xpThisWeek: Math.max(0, xpMap.get(dev.id) ?? 0),
      streak: streakIsCurrent ? (dev.app_streak ?? 0) : 0,
      rank: dev.rank ?? null,
      visitors: visitMap.get(dev.id) ?? 0,
      kudos: kudosMap.get(dev.id) ?? 0,
      raidsAgainst: raidMap.get(dev.id) ?? 0,
      raidsDefended: defendedMap.get(dev.id) ?? 0,
      raidWins: winMap.get(dev.id) ?? 0,
      emblems: emblemMap.get(dev.id) ?? [],
      activeTagBy: tagMap.get(dev.id) ?? null,
      townOfWeek,
      newDevelopers,
    });
  }
  return recaps;
}
