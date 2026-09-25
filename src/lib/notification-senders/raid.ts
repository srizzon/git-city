import { sendNotificationAsync } from "../notifications";
import { RAID_TAG_DURATION_DAYS, XP_LOSE_DEFENDER, XP_WIN_DEFENDER } from "../raid";
import { EMAIL_BASE_URL, button, heading, heroImage, paragraph, trackedUrl } from "../email/components";
import { renderLayout, renderText, type EmailLinks } from "../email/layout";

export interface RaidEmailData {
  defenderLogin: string;
  attackerLogin: string;
  raidId: string | number;
  success: boolean;
  attackScore: number;
  defenseScore: number;
}

function raidHeader(d: RaidEmailData) {
  return d.success
    ? {
        subject: `@${d.attackerLogin} tagged your building`,
        preheader: `Their tag stays up for ${RAID_TAG_DURATION_DAYS} days. Raid them back.`,
      }
    : {
        subject: `You held off @${d.attackerLogin}`,
        preheader: `Your defense of ${d.defenseScore} beat their attack of ${d.attackScore}.`,
      };
}

export function renderRaidEmail(d: RaidEmailData, links: EmailLinks) {
  const { subject, preheader } = raidHeader(d);
  const battleUrl = trackedUrl(`/battle/${d.raidId}`, "raid_alert");
  const raidBackUrl = trackedUrl(`/?user=${encodeURIComponent(d.attackerLogin)}`, "raid_alert");

  const title = d.success ? ["", `@${d.attackerLogin}`, " broke through"] : ["You held off ", `@${d.attackerLogin}`, ""];
  const intro = d.success
    ? `Their attack scored ${d.attackScore} against your defense of ${d.defenseScore}. Their tag is on your building for the next ${RAID_TAG_DURATION_DAYS} days, where everyone flying by can see it.`
    : `Your defense of ${d.defenseScore} beat their attack of ${d.attackScore}. Your building stays clean, and you earned ${XP_LOSE_DEFENDER} XP.`;
  const xp = d.success
    ? `You still earned ${XP_WIN_DEFENDER} XP for the fight. Raid them back to put your tag on their building.`
    : null;
  const cta = d.success ? { text: `Raid @${d.attackerLogin} back`, url: raidBackUrl } : { text: "See the battle", url: battleUrl };
  const reason = "You're getting this because someone raided your building on Git City.";

  const html = renderLayout({
    title: subject,
    preheader,
    hero: heroImage({
      src: `${EMAIL_BASE_URL}/battle/${d.raidId}/defender-image`,
      href: battleUrl,
      alt: `Battle result: @${d.attackerLogin} ${d.attackScore}, @${d.defenderLogin} ${d.defenseScore}`,
    }),
    body: [
      heading(title[0].trim(), title[1], title[2]),
      paragraph(intro),
      xp ? paragraph(xp) : "",
      button(cta.text, cta.url),
    ].join("\n"),
    reason,
    links,
  });

  const text = renderText({
    lines: [title.join(""), "", intro, ...(xp ? ["", xp] : []), "", `${cta.text}: ${cta.url}`],
    reason,
    links,
  });

  return { subject, preheader, html, text };
}

export function sendRaidAlertNotification(
  defenderId: number,
  defenderLogin: string,
  attackerLogin: string,
  raidId: string | number,
  success: boolean,
  attackScore: number,
  defenseScore: number,
) {
  const data: RaidEmailData = { defenderLogin, attackerLogin, raidId, success, attackScore, defenseScore };
  const { subject, preheader } = raidHeader(data);

  sendNotificationAsync({
    type: "raid_alert",
    category: "social",
    developerId: defenderId,
    dedupKey: `raid:${raidId}`,
    skipIfActive: true,
    title: subject,
    body: preheader,
    render: (links) => renderRaidEmail(data, links),
    actionUrl: `${EMAIL_BASE_URL}/battle/${raidId}`,
    priority: "normal",
    channels: ["email"],
    batchKey: `raids:${defenderId}`,
    batchWindowMinutes: 60,
    batchEventData: {
      attacker: attackerLogin,
      success,
      attack_score: attackScore,
      defense_score: defenseScore,
    },
  });
}
