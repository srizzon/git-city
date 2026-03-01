import { getResend } from "./resend";

const FROM = "Git City <noreply@thegitcity.com>";

export async function sendAdExpiringEmail(
  email: string,
  adBrand: string,
  daysLeft: number,
  trackingUrl: string,
) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your Git City ad expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html: `
      <div style="font-family: monospace; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0f1e; color: #e0d8cc;">
        <h2 style="color: #c8e64a; margin-top: 0;">Heads up!</h2>
        <p>Your ad <strong>"${escapeHtml(adBrand)}"</strong> expires in <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong>.</p>
        <p>Check your stats before it ends:</p>
        <p><a href="${escapeHtml(trackingUrl)}" style="color: #c8e64a;">View Dashboard</a></p>
        <p>Want to keep running? <a href="https://thegitcity.com/advertise" style="color: #c8e64a;">Renew your ad</a></p>
        <hr style="border-color: #222; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Git City - thegitcity.com</p>
      </div>
    `,
  });
}

export async function sendAdExpiredEmail(
  email: string,
  adBrand: string,
  stats: { impressions: number; clicks: number },
  advertiseUrl: string,
) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your Git City ad "${escapeHtml(adBrand)}" has ended`,
    html: `
      <div style="font-family: monospace; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0f1e; color: #e0d8cc;">
        <h2 style="color: #c8e64a; margin-top: 0;">Campaign complete</h2>
        <p>Your ad <strong>"${escapeHtml(adBrand)}"</strong> has ended. Here are the results:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #222; color: #c8e64a; font-size: 20px;">${stats.impressions.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #222;">impressions</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #222; color: #c8e64a; font-size: 20px;">${stats.clicks.toLocaleString()}</td>
            <td style="padding: 8px; border: 1px solid #222;">clicks</td>
          </tr>
        </table>
        <p>Ready for another run?</p>
        <p><a href="${escapeHtml(advertiseUrl)}" style="color: #c8e64a;">Buy a new ad</a></p>
        <hr style="border-color: #222; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Git City - thegitcity.com</p>
      </div>
    `,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
