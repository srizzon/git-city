const BASE_URL = "https://thegitcity.com";

export function wrapInBaseTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  const footer = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color: #666; text-decoration: underline;">Unsubscribe</a> | `
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background: #060a14; font-family: monospace;">
  <div style="max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0a0f1e; color: #e0d8cc;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 28px; letter-spacing: 4px; color: #c8e64a;">GIT CITY</h1>
    </div>

    <!-- Pixel divider -->
    <div style="height: 2px; background: linear-gradient(90deg, transparent, #c8e64a, transparent); margin-bottom: 24px;"></div>

    <!-- Body -->
    ${bodyHtml}

    <!-- Pixel divider -->
    <div style="height: 2px; background: linear-gradient(90deg, transparent, #222, transparent); margin: 24px 0;"></div>

    <!-- Footer -->
    <div style="text-align: center; font-size: 12px; color: #666;">
      ${footer}<a href="${BASE_URL}" style="color: #666; text-decoration: underline;">thegitcity.com</a>
    </div>
  </div>
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
  return `<div style="text-align: center; margin: 20px 0;">
  <a href="${escapeHtml(url)}" style="display: inline-block; padding: 12px 28px; background: #c8e64a; color: #0a0f1e; font-family: monospace; font-weight: bold; font-size: 14px; text-decoration: none; border: 2px solid #c8e64a;">
    ${escapeHtml(text)}
  </a>
</div>`;
}

export function buildStatRow(label: string, value: string | number): string {
  return `<tr>
  <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #c8e64a; font-size: 18px; font-weight: bold;">${value}</td>
  <td style="padding: 8px 12px; border: 1px solid #1a1f2e; color: #e0d8cc;">${escapeHtml(String(label))}</td>
</tr>`;
}

export function buildStatsTable(rows: { label: string; value: string | number }[]): string {
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
  ${rows.map((r) => buildStatRow(r.label, r.value)).join("\n")}
</table>`;
}
