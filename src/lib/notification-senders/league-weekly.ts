import { sendNotification } from "../notifications";
import { buildButton, buildStatsTable, escapeHtml } from "../email-template";
import type { ClosedLeague } from "../leagues/close";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Monday results email to every active member of a closed league. Awaited
 * (not fire-and-forget) so the close cron finishes its sends.
 */
export async function sendLeagueWeeklyResults(closed: ClosedLeague, previousGlobalRank: number | null): Promise<number> {
  const { league, week } = closed;
  const standings = week.standings;
  const winner = standings.find((s) => s.developer_id === closed.winnerId) ?? null;
  const podiumScore = standings[Math.min(2, standings.length - 1)]?.total ?? 0;
  const url = `${BASE_URL}/league/${league.slug}`;
  const name = escapeHtml(league.name);

  let globalLine = "";
  if (league.kind === "company" && closed.globalRank) {
    const moved =
      previousGlobalRank && previousGlobalRank !== closed.globalRank
        ? closed.globalRank > previousGlobalRank
          ? ` (down from ${ordinal(previousGlobalRank)})`
          : ` (up from ${ordinal(previousGlobalRank)})`
        : "";
    globalLine = `${league.name} finished ${ordinal(closed.globalRank)} of ${closed.globalTotal} companies${moved}.`;
  }

  let sent = 0;
  for (const me of standings) {
    const isWinner = me.developer_id === closed.winnerId;
    const gap = me.rank > 3 ? podiumScore - me.total : 0;
    const headline = isWinner
      ? `You won ${league.name} this week`
      : winner
        ? `@${winner.login} won ${league.name} this week`
        : `${league.name}: the week is closed`;
    const yourLine = isWinner
      ? "Your building wears the crown for 7 days. +100 XP."
      : `You finished ${ordinal(me.rank)} of ${standings.length}${gap > 0 ? `, ${gap} points off the podium` : ""}.`;

    const results = await sendNotification({
      type: "league_weekly",
      category: "leagues",
      developerId: me.developer_id,
      dedupKey: `league_weekly:${me.developer_id}:${league.id}:${week.weekStart}`,
      title: headline,
      body: `${yourLine}${globalLine ? ` ${globalLine}` : ""}`,
      html: `
        <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">${name} · weekly results</p>
        <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(headline)}</h1>
        <p style="margin:0 0 20px; font-size:15px; color:#555555; line-height:1.6;">${escapeHtml(yourLine)}${globalLine ? `<br />${escapeHtml(globalLine)}` : ""}</p>
        ${buildStatsTable(
          standings.slice(0, 3).map((s) => ({ label: `${ordinal(s.rank)} · @${s.login}`, value: s.total })),
        )}
        ${buildButton("See the league", url)}
      `,
      actionUrl: url,
      priority: "normal",
      channels: ["email"],
    });
    if (results.some((r) => r.success)) sent++;
  }
  return sent;
}
