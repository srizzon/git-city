import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

export function sendRaidAlertNotification(
  defenderId: number,
  defenderLogin: string,
  attackerLogin: string,
  raidId: string | number,
  success: boolean,
  attackScore: number,
  defenseScore: number,
) {
  const outcome = success
    ? `@${attackerLogin} attacked your building!`
    : `You defended against @${attackerLogin}!`;

  const labelColor = success ? "#cc4444" : "#5a8a00";
  const label = success ? "Building attacked" : "Defense successful";
  const heading = success
    ? `@${attackerLogin} broke through.`
    : `You held off @${attackerLogin}.`;
  const subtext = success
    ? `Their attack score of ${attackScore} beat your defense of ${defenseScore}.`
    : `Your defense score of ${defenseScore} stopped their attack of ${attackScore}.`;

  sendNotificationAsync({
    type: "raid_alert",
    category: "social",
    developerId: defenderId,
    dedupKey: `raid:${raidId}`,
    skipIfActive: true,
    title: outcome,
    body: `Attack: ${attackScore} vs Defense: ${defenseScore}. ${outcome}`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:${labelColor}; letter-spacing:1px; text-transform:uppercase;">${label}</p>
      <h1 style="margin:0 0 8px; font-size:24px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${heading}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">${subtext}</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("View Your Building", `${BASE_URL}/?user=${defenderLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${defenderLogin}`,
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
