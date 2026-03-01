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
    ? `@${attackerLogin} raided your building!`
    : `You defended against @${attackerLogin}!`;

  const outcomeHtml = success
    ? `<p style="color: #ff6b6b; font-size: 16px;">Your building was raided!</p>
       <p style="color: #e0d8cc;"><strong>@${attackerLogin}</strong> broke through your defenses.</p>`
    : `<p style="color: #c8e64a; font-size: 16px;">Defense successful!</p>
       <p style="color: #e0d8cc;">You held off <strong>@${attackerLogin}</strong>'s attack.</p>`;

  sendNotificationAsync({
    type: "raid_alert",
    category: "social",
    developerId: defenderId,
    dedupKey: `raid:${raidId}`,
    skipIfActive: true, // Don't email if they're online watching it happen
    title: outcome,
    body: `Attack: ${attackScore} vs Defense: ${defenseScore}. ${outcome}`,
    html: `
      ${outcomeHtml}
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #ff6b6b; font-size: 18px; font-weight: bold;">${attackScore}</td>
          <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #e0d8cc;">Attack</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #c8e64a; font-size: 18px; font-weight: bold;">${defenseScore}</td>
          <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #e0d8cc;">Defense</td>
        </tr>
      </table>
      ${buildButton("View Your Building", `${BASE_URL}/?user=${defenderLogin}`)}
    `,
    actionUrl: `${BASE_URL}/?user=${defenderLogin}`,
    priority: "normal",
    channels: ["email"],
    // Batch eligible: if user gets raided 5 times in an hour, send 1 digest
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
