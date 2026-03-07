const BASE_URL = "https://thegitcity.com";
const FONT = `'Silkscreen', monospace`;
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap');`;

export function wrapInBaseTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  const footer = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color: #999999; text-decoration: underline; font-size: 12px; font-family: Helvetica, Arial, sans-serif;">unsubscribe</a> &middot; `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <style>
    ${FONT_IMPORT}
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; padding: 0 !important; }
      .content { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f6; font-family: Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%;">

  <!-- Preheader (hidden) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;"></div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f5f6" style="background-color: #f4f5f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="wrapper" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${BASE_URL}/icon-512.png" width="64" height="64" alt="Git City" style="display:block; border-radius:16px; border:0;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 6px; padding: 40px 40px 32px;" class="content">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top: 24px;">
              <p style="margin: 0; font-size: 12px; color: #999999; font-family: Helvetica, Arial, sans-serif;">
                ${footer}<a href="${BASE_URL}" style="color: #999999; text-decoration: none; font-size: 12px;">thegitcity.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px auto 0;">
  <tr>
    <td align="center" bgcolor="#111111" style="border-radius: 4px;">
      <a href="${escapeHtml(url)}" style="display: inline-block; padding: 14px 32px; background-color: #111111; border-radius: 4px; color: #ffffff; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; letter-spacing: 0.5px;">
        ${escapeHtml(text)}
      </a>
    </td>
  </tr>
</table>`;
}

export function buildStatRow(label: string, value: string | number): string {
  return `<tr>
  <td style="padding: 10px 14px; border: 1px solid #eeeeee; color: #111111; font-size: 20px; font-weight: bold; font-family: Helvetica, Arial, sans-serif;">${value}</td>
  <td style="padding: 10px 14px; border: 1px solid #eeeeee; color: #555555; font-family: Helvetica, Arial, sans-serif; font-size: 14px;">${escapeHtml(String(label))}</td>
</tr>`;
}

export function buildStatsTable(rows: { label: string; value: string | number }[]): string {
  return `<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
  ${rows.map((r) => buildStatRow(r.label, r.value)).join("\n")}
</table>`;
}
