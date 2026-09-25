import { sendNotification } from "../notifications";
import { EMAIL_BASE_URL, button, detailRows, heading, label, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";
import { CROWN_DAYS, PIXEL_MIN_ACTIVE, WINNER_PIXELS, WINNER_XP, type ClosedLeague } from "../leagues/close";
import { townDisplayName } from "../towns/names";
import { ordinal, points, townHero } from "./town-email";

interface Placing {
  rank: number;
  login: string;
  total: number;
}

export interface LeagueWeeklyEmailData {
  leagueSlug: string;
  leagueName: string;
  /** Final standings of the closed week, best first. */
  standings: Placing[];
  me: Placing;
  /** Null when nobody scored, so nobody won. */
  winnerLogin: string | null;
  /** Company towns: "Acme Town finished 4th of 12 companies (up from 6th)." */
  globalLine: string | null;
}

function leagueWeeklyHeader(d: LeagueWeeklyEmailData) {
  const town = townDisplayName(d.leagueName);
  const isWinner = d.winnerLogin !== null && d.winnerLogin === d.me.login;
  const podium = d.standings[Math.min(2, d.standings.length - 1)]?.total ?? 0;
  const offPodium = d.me.rank > 3 ? podium - d.me.total : 0;
  const finish = `You finished ${ordinal(d.me.rank)} of ${d.standings.length} with ${points(d.me.total)}${offPodium > 0 ? `, ${points(offPodium)} off the podium` : ""}.`;
  const pixels = d.standings.length >= PIXEL_MIN_ACTIVE ? WINNER_PIXELS : 0;
  const prize = `${WINNER_XP} XP${pixels ? `, ${pixels} pixels` : ""} and a win on your Weekly Champion emblem`;

  if (isWinner) {
    return {
      town,
      variant: "won" as const,
      subject: `You won the week in ${town}`,
      preheader: `Your building wears the crown for ${CROWN_DAYS} days. +${WINNER_XP} XP.`,
      intro: `You topped ${town} with ${points(d.me.total)}. Your building wears the crown for the next ${CROWN_DAYS} days, and you earned ${prize}.`,
    };
  }
  if (d.winnerLogin) {
    return {
      town,
      variant: "lost" as const,
      subject: `@${d.winnerLogin} won the week in ${town}`,
      preheader: finish,
      intro: `${finish} @${d.winnerLogin} takes the crown for ${CROWN_DAYS} days.`,
    };
  }
  return {
    town,
    variant: "empty" as const,
    subject: `No winner in ${town} last week`,
    preheader: "Nobody scored, so nobody takes the crown. The new race is on.",
    intro: `Nobody in ${town} scored last week, so nobody takes the crown.`,
  };
}

export function renderLeagueWeeklyEmail(d: LeagueWeeklyEmailData, links: EmailLinks) {
  const { town, variant, subject, preheader, intro } = leagueWeeklyHeader(d);
  const townUrl = trackedUrl(`/town/${d.leagueSlug}`, "league_weekly");
  const next = "A new week started Monday 00:00 UTC and everyone is back at zero.";

  const shown = d.standings.slice(0, 3);
  if (d.me.rank > 3) shown.push(d.me);
  const rows =
    variant === "empty"
      ? []
      : shown.map((s) => ({
          label: `${ordinal(s.rank)} @${s.login}${s.login === d.me.login ? " (you)" : ""}`,
          value: points(s.total),
        }));

  const title: [string, string, string] =
    variant === "won" ? ["You won", town, ""] : variant === "lost" ? ["", `@${d.winnerLogin}`, ` won ${town}`] : ["No winner in", town, ""];
  const reason = `You're getting this because you're a member of ${town} on Git City.`;

  const html = renderLayout({
    title: subject,
    preheader,
    hero: townHero(d.leagueSlug, town, townUrl),
    body: [
      heading(title[0], title[1], title[2]),
      paragraph(intro),
      d.globalLine ? paragraph(d.globalLine) : "",
      rows.length ? label("Final standings") + detailRows(rows) : "",
      paragraph(next),
      button("See this week's race", townUrl),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [
      title.join(" ").replace(/\s+/g, " ").trim(),
      "",
      intro,
      ...(d.globalLine ? ["", d.globalLine] : []),
      ...(rows.length ? ["", "Final standings:", ...rows.map((r) => `${r.label}: ${r.value}`)] : []),
      "",
      next,
      "",
      `See this week's race: ${townUrl}`,
    ],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

/**
 * Monday results email to every active member of a closed town. Awaited
 * (not fire-and-forget) so the close cron finishes its sends.
 */
export async function sendLeagueWeeklyResults(closed: ClosedLeague, previousGlobalRank: number | null): Promise<number> {
  const { league, week } = closed;
  const standings: Placing[] = week.standings.map((s) => ({ rank: s.rank, login: s.login, total: s.total }));
  const winner = week.standings.find((s) => s.developer_id === closed.winnerId) ?? null;
  const town = townDisplayName(league.name);

  let globalLine: string | null = null;
  if (league.kind === "company" && closed.globalRank) {
    const moved =
      previousGlobalRank && previousGlobalRank !== closed.globalRank
        ? closed.globalRank > previousGlobalRank
          ? ` (down from ${ordinal(previousGlobalRank)})`
          : ` (up from ${ordinal(previousGlobalRank)})`
        : "";
    globalLine = `${town} finished ${ordinal(closed.globalRank)} of ${closed.globalTotal} companies${moved}.`;
  }

  let sent = 0;
  for (const me of week.standings) {
    const data: LeagueWeeklyEmailData = {
      leagueSlug: league.slug,
      leagueName: league.name,
      standings,
      me: { rank: me.rank, login: me.login, total: me.total },
      winnerLogin: winner?.login ?? null,
      globalLine,
    };
    const { subject, preheader } = leagueWeeklyHeader(data);

    const results = await sendNotification({
      type: "league_weekly",
      category: "leagues",
      developerId: me.developer_id,
      dedupKey: `league_weekly:${me.developer_id}:${league.id}:${week.weekStart}`,
      title: subject,
      body: preheader,
      render: (links) => renderLeagueWeeklyEmail(data, links),
      actionUrl: `${EMAIL_BASE_URL}/town/${league.slug}`,
      priority: "normal",
      channels: ["email"],
    });
    if (results.some((r) => r.success)) sent++;
  }
  return sent;
}
