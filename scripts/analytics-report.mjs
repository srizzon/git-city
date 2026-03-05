#!/usr/bin/env node

/**
 * Git City Analytics Report
 *
 * Puxa dados do Supabase e gera um relatorio completo em Markdown.
 * Uso: node scripts/analytics-report.mjs
 */

import fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Try loading from .env.local
  try {
    const envFile = fs.readFileSync(".env.local", "utf-8");
    for (const line of envFile.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
    }
  } catch {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or create .env.local",
    );
    process.exit(1);
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function query(table, params = "") {
  const res = await fetch(`${URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: "count=exact",
    },
  });
  const count = res.headers.get("content-range")?.split("/")[1];
  const data = await res.json();
  return { data, count: count ? parseInt(count) : data.length };
}

// Paginated fetch: grabs all rows from a table
async function fetchAll(table, params = "") {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const sep = params ? "&" : "";
    const res = await fetch(
      `${URL}/rest/v1/${table}?${params}${sep}limit=${PAGE}&offset=${offset}`,
      {
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          Prefer: "count=exact",
        },
      },
    );
    const data = await res.json();
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function rpc(fn, body = {}) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Helper: group array by a key function, return counts
function groupByDay(items, dateField) {
  const map = {};
  for (const item of items) {
    const day = item[dateField]?.slice(0, 10);
    if (day) map[day] = (map[day] || 0) + 1;
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

function formatNum(n) {
  return n.toLocaleString("en-US");
}

async function main() {
  console.log("Puxando dados do Supabase...\n");

  // 1. Developers (all fields we need)
  console.log("  Puxando developers...");
  const devs = await fetchAll(
    "developers",
    "select=id,github_login,contributions,contributions_total,public_repos,total_stars,kudos_count,visit_count,referral_count,created_at,claimed,claimed_at,primary_language,followers,following,total_prs,total_reviews,total_issues,app_streak,app_longest_streak,account_created_at&order=created_at.asc",
  );
  const devsByDay = groupByDay(devs, "created_at");

  // 2. Purchases
  console.log("  Puxando purchases...");
  const purchases = await fetchAll(
    "purchases",
    "select=id,developer_id,item_id,amount_cents,currency,status,provider,created_at,gifted_to&status=eq.completed&order=created_at.asc",
  );
  const purchasesByDay = groupByDay(purchases, "created_at");

  // 3. Sky Ads (paid)
  console.log("  Puxando sky ads...");
  const ads = await fetchAll(
    "sky_ads",
    "select=id,brand,vehicle,plan_id,purchaser_email,active,starts_at,ends_at,created_at&plan_id=not.is.null&order=created_at.asc",
  );
  const paidAds = ads.filter((a) => a.purchaser_email);
  const abandonedAds = ads.filter((a) => !a.purchaser_email);
  const adsByDay = groupByDay(paidAds, "created_at");

  // 4. Ad Events (counts only, too many rows to fetch all)
  console.log("  Puxando ad events (counts)...");
  const { count: impressionCount } = await query(
    "sky_ad_events",
    "event_type=eq.impression&select=id&limit=1",
  );
  const { count: clickCount } = await query(
    "sky_ad_events",
    "event_type=eq.click&select=id&limit=1",
  );
  const { count: ctaClickCount } = await query(
    "sky_ad_events",
    "event_type=eq.cta_click&select=id&limit=1",
  );

  // 5. Kudos
  console.log("  Puxando kudos...");
  const kudos = await fetchAll(
    "developer_kudos",
    "select=giver_id,receiver_id,given_date,created_at&order=created_at.asc",
  );
  const kudosByDay = groupByDay(kudos, "created_at");

  // 6. Building visits
  console.log("  Puxando building visits...");
  const visits = await fetchAll(
    "building_visits",
    "select=visitor_id,building_id,visit_date,created_at&order=created_at.asc",
  );
  const visitsByDay = groupByDay(visits, "created_at");

  // 7. Achievements unlocked
  console.log("  Puxando achievements...");
  const achievements = await fetchAll(
    "developer_achievements",
    "select=developer_id,achievement_id,unlocked_at&order=unlocked_at.asc",
  );
  const achievementsByDay = groupByDay(achievements, "unlocked_at");

  // 8. Streak checkins
  console.log("  Puxando streak checkins...");
  const checkins = await fetchAll(
    "streak_checkins",
    "select=developer_id,checkin_date,type&order=checkin_date.asc",
  );
  const checkinsByDay = groupByDay(checkins, "checkin_date");

  // 9. City stats
  console.log("  Puxando city stats...");
  const { data: cityStats } = await query("city_stats", "id=eq.1");
  const stats = cityStats[0] || {};

  // Calculate revenue
  let revenueUSD = 0;
  let revenueBRL = 0;
  for (const p of purchases) {
    if (p.currency === "usd") revenueUSD += p.amount_cents;
    else if (p.currency === "brl") revenueBRL += p.amount_cents;
  }

  // Purchases by item
  const itemCounts = {};
  for (const p of purchases) {
    itemCounts[p.item_id] = (itemCounts[p.item_id] || 0) + 1;
  }

  // Ads by vehicle
  const adsByVehicle = {};
  for (const a of paidAds) {
    adsByVehicle[a.vehicle] = (adsByVehicle[a.vehicle] || 0) + 1;
  }

  // Ads by plan
  const adsByPlan = {};
  for (const a of paidAds) {
    adsByPlan[a.plan_id] = (adsByPlan[a.plan_id] || 0) + 1;
  }

  // Top devs by kudos
  const topKudos = [...devs].sort((a, b) => b.kudos_count - a.kudos_count).slice(0, 10);

  // Top devs by visits
  const topVisits = [...devs].sort((a, b) => b.visit_count - a.visit_count).slice(0, 10);

  // Top devs by contributions
  const topContribs = [...devs].sort((a, b) => b.contributions - a.contributions).slice(0, 10);

  // Top devs by referrals
  const topReferrals = [...devs]
    .filter((d) => d.referral_count > 0)
    .sort((a, b) => b.referral_count - a.referral_count)
    .slice(0, 10);

  // Gifts
  const gifts = purchases.filter((p) => p.gifted_to);

  // Unique kudos givers
  const uniqueKudosGivers = new Set(kudos.map((k) => k.giver_id)).size;
  const uniqueKudosReceivers = new Set(kudos.map((k) => k.receiver_id)).size;

  // Unique visitors
  const uniqueVisitors = new Set(visits.map((v) => v.visitor_id)).size;

  // Claimed vs unclaimed (logged in users)
  const claimedDevs = devs.filter((d) => d.claimed);
  const unclaimedDevs = devs.filter((d) => !d.claimed);
  const claimedByDay = groupByDay(
    claimedDevs.filter((d) => d.claimed_at),
    "claimed_at",
  );
  const claimRate = ((claimedDevs.length / devs.length) * 100).toFixed(1);

  // Languages
  const langCounts = {};
  for (const d of devs) {
    const lang = d.primary_language || "Unknown";
    langCounts[lang] = (langCounts[lang] || 0) + 1;
  }
  const topLanguages = Object.entries(langCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  // Aggregate stats
  const totalStars = devs.reduce((s, d) => s + (d.total_stars || 0), 0);
  const totalRepos = devs.reduce((s, d) => s + (d.public_repos || 0), 0);
  const totalPRs = devs.reduce((s, d) => s + (d.total_prs || 0), 0);
  const totalReviews = devs.reduce((s, d) => s + (d.total_reviews || 0), 0);
  const totalIssues = devs.reduce((s, d) => s + (d.total_issues || 0), 0);
  const totalFollowers = devs.reduce((s, d) => s + (d.followers || 0), 0);
  const totalContribsAll = devs.reduce(
    (s, d) => s + (d.contributions_total || d.contributions || 0),
    0,
  );

  // Notable devs (top by followers or stars)
  const topByFollowers = [...devs]
    .sort((a, b) => (b.followers || 0) - (a.followers || 0))
    .slice(0, 20);
  const topByStars = [...devs]
    .sort((a, b) => (b.total_stars || 0) - (a.total_stars || 0))
    .slice(0, 20);

  // Repeat ad customers
  const adCustomerCounts = {};
  for (const a of paidAds) {
    if (a.purchaser_email) {
      const key = a.purchaser_email;
      if (!adCustomerCounts[key])
        adCustomerCounts[key] = { email: key, brand: a.brand, count: 0, totalAds: [] };
      adCustomerCounts[key].count++;
      adCustomerCounts[key].totalAds.push(a.plan_id);
    }
  }
  const repeatAdCustomers = Object.values(adCustomerCounts)
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count);
  const uniqueAdCustomers = Object.keys(adCustomerCounts).length;

  // Paid purchases only (excluding free achievement items, amount > 0)
  const paidPurchases = purchases.filter((p) => p.amount_cents > 0);
  const freePurchases = purchases.filter((p) => p.amount_cents === 0);

  // Active streaks
  const activeStreaks = devs.filter((d) => d.app_streak > 0);
  const longestStreak = Math.max(...devs.map((d) => d.app_longest_streak || 0));
  const avgStreak =
    activeStreaks.length > 0
      ? (activeStreaks.reduce((s, d) => s + d.app_streak, 0) / activeStreaks.length).toFixed(1)
      : 0;

  // Countries can't be derived from DB, but GitHub account age can be interesting
  const oldestAccounts = devs
    .filter((d) => d.account_created_at)
    .sort((a, b) => new Date(a.account_created_at) - new Date(b.account_created_at))
    .slice(0, 10);
  const newestAccounts = devs
    .filter((d) => d.account_created_at)
    .sort((a, b) => new Date(b.account_created_at) - new Date(a.account_created_at))
    .slice(0, 5);

  // Day-over-day growth
  const growthRates = [];
  let prevCum = 0;
  for (const day of [...new Set(devsByDay.map(([d]) => d))].sort()) {
    const count = Object.fromEntries(devsByDay)[day] || 0;
    const cum = prevCum + count;
    if (prevCum > 0) {
      growthRates.push({ day, growth: ((count / prevCum) * 100).toFixed(1) });
    }
    prevCum = cum;
  }

  // All days
  const allDays = new Set();
  for (const [day] of devsByDay) allDays.add(day);
  for (const [day] of purchasesByDay) allDays.add(day);
  for (const [day] of adsByDay) allDays.add(day);
  for (const [day] of kudosByDay) allDays.add(day);
  for (const [day] of visitsByDay) allDays.add(day);
  for (const [day] of checkinsByDay) allDays.add(day);
  const sortedDays = [...allDays].sort();

  // Build daily table data
  const dayMap = (arr) => Object.fromEntries(arr);
  const devsMap = dayMap(devsByDay);
  const purchasesMap = dayMap(purchasesByDay);
  const adsMap = dayMap(adsByDay);
  const kudosMap = dayMap(kudosByDay);
  const visitsMap = dayMap(visitsByDay);
  const checkinsMap = dayMap(checkinsByDay);
  const achievementsMap = dayMap(achievementsByDay);

  // Generate report
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  let report = `# Git City Analytics Report

Gerado em: ${now} UTC

---

## Resumo Geral

| Metrica | Valor |
|---------|-------|
| Total de devs | ${formatNum(devs.length)} |
| Devs claimed (logaram) | ${formatNum(claimedDevs.length)} (${claimRate}%) |
| Devs nao claimed | ${formatNum(unclaimedDevs.length)} |
| Total de contribuicoes | ${formatNum(totalContribsAll)} |
| Total de repos publicos | ${formatNum(totalRepos)} |
| Total de stars (todos os devs) | ${formatNum(totalStars)} |
| Total de PRs | ${formatNum(totalPRs)} |
| Total de reviews | ${formatNum(totalReviews)} |
| Total de issues | ${formatNum(totalIssues)} |
| Total de followers (todos os devs) | ${formatNum(totalFollowers)} |
| Compras na shop (total) | ${formatNum(purchases.length)} |
| Compras pagas (com $) | ${formatNum(paidPurchases.length)} |
| Items gratis (achievements) | ${formatNum(freePurchases.length)} |
| Receita shop (USD) | $${(revenueUSD / 100).toFixed(2)} |
| Receita shop (BRL) | R$${(revenueBRL / 100).toFixed(2)} |
| Ads pagos | ${formatNum(paidAds.length)} |
| Ads abandonados (nao pagaram) | ${formatNum(abandonedAds.length)} |
| Clientes de ads unicos | ${formatNum(uniqueAdCustomers)} |
| Clientes que compraram 2+ ads | ${formatNum(repeatAdCustomers.length)} |
| Ad impressions | ${formatNum(parseInt(impressionCount) || 0)} |
| Ad clicks (3D) | ${formatNum(parseInt(clickCount) || 0)} |
| Ad CTA clicks | ${formatNum(parseInt(ctaClickCount) || 0)} |
| Ad CTR | ${impressionCount > 0 ? ((clickCount / impressionCount) * 100).toFixed(2) : "0"}% |
| Total kudos | ${formatNum(kudos.length)} |
| Kudos givers unicos | ${formatNum(uniqueKudosGivers)} |
| Kudos receivers unicos | ${formatNum(uniqueKudosReceivers)} |
| Building visits | ${formatNum(visits.length)} |
| Visitors unicos | ${formatNum(uniqueVisitors)} |
| Achievements desbloqueados | ${formatNum(achievements.length)} |
| Streak checkins | ${formatNum(checkins.length)} |
| Devs com streak ativo | ${formatNum(activeStreaks.length)} |
| Maior streak | ${longestStreak} dias |
| Media de streak (ativos) | ${avgStreak} dias |
| Gifts enviados | ${formatNum(gifts.length)} |

---

## Metricas por Dia

| Dia | Novos devs | Acumulado | Compras | Ads pagos | Kudos | Visits | Checkins | Achievements |
|-----|-----------|-----------|---------|-----------|-------|--------|----------|-------------|
`;

  let cumDevs = 0;
  for (const day of sortedDays) {
    const nd = devsMap[day] || 0;
    cumDevs += nd;
    const p = purchasesMap[day] || 0;
    const a = adsMap[day] || 0;
    const k = kudosMap[day] || 0;
    const v = visitsMap[day] || 0;
    const c = checkinsMap[day] || 0;
    const ach = achievementsMap[day] || 0;
    report += `| ${day} | ${nd} | ${formatNum(cumDevs)} | ${p} | ${a} | ${k} | ${v} | ${c} | ${ach} |\n`;
  }

  report += `
---

## Ads: Vendas por Formato

| Formato | Vendas |
|---------|--------|
`;
  for (const [plan, count] of Object.entries(adsByPlan).sort(([, a], [, b]) => b - a)) {
    report += `| ${plan} | ${count} |\n`;
  }

  report += `
## Ads: Vendas por Veiculo

| Veiculo | Vendas |
|---------|--------|
`;
  for (const [v, count] of Object.entries(adsByVehicle).sort(([, a], [, b]) => b - a)) {
    report += `| ${v} | ${count} |\n`;
  }

  report += `
## Ads: Lista de Clientes

| Brand | Veiculo | Plano | Email | Inicio | Fim |
|-------|---------|-------|-------|--------|-----|
`;
  for (const a of paidAds) {
    report += `| ${a.brand || "(sem nome)"} | ${a.vehicle} | ${a.plan_id} | ${a.purchaser_email} | ${a.starts_at?.slice(0, 10) || "-"} | ${a.ends_at?.slice(0, 10) || "-"} |\n`;
  }

  report += `
---

## Shop: Compras por Item

| Item | Vendas |
|------|--------|
`;
  for (const [item, count] of Object.entries(itemCounts).sort(([, a], [, b]) => b - a)) {
    report += `| ${item} | ${count} |\n`;
  }

  report += `
---

## Top 10 Devs por Kudos

| # | Dev | Kudos |
|---|-----|-------|
`;
  topKudos.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.kudos_count)} |\n`;
  });

  report += `
## Top 10 Devs por Visits

| # | Dev | Visits |
|---|-----|--------|
`;
  topVisits.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.visit_count)} |\n`;
  });

  report += `
## Top 10 Devs por Contribuicoes

| # | Dev | Contribuicoes |
|---|-----|--------------|
`;
  topContribs.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.contributions)} |\n`;
  });

  report += `
## Top Referrers

| # | Dev | Referrals |
|---|-----|-----------|
`;
  topReferrals.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.referral_count)} |\n`;
  });

  // Claimed by day table
  report += `
---

## Claimed (Login) por Dia

| Dia | Novos claims | Acumulado |
|-----|-------------|-----------|
`;
  let cumClaimed = 0;
  for (const [day, count] of claimedByDay) {
    cumClaimed += count;
    report += `| ${day} | ${count} | ${formatNum(cumClaimed)} |\n`;
  }

  // Repeat ad customers
  report += `
---

## Ads: Clientes Repetidos

| Email | Ads comprados | Planos |
|-------|-------------|--------|
`;
  for (const c of repeatAdCustomers) {
    report += `| ${c.email} | ${c.count} | ${c.totalAds.join(", ")} |\n`;
  }

  // Languages
  report += `
---

## Linguagens mais usadas na cidade

| # | Linguagem | Devs |
|---|-----------|------|
`;
  topLanguages.forEach(([lang, count], i) => {
    report += `| ${i + 1} | ${lang} | ${formatNum(count)} |\n`;
  });

  // Notable devs by followers
  report += `
---

## Devs mais famosos na cidade (por followers)

| # | Dev | Followers | Stars | Contribuicoes |
|---|-----|-----------|-------|--------------|
`;
  topByFollowers.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.followers || 0)} | ${formatNum(d.total_stars || 0)} | ${formatNum(d.contributions_total || d.contributions)} |\n`;
  });

  // Notable devs by stars
  report += `
## Devs com mais stars na cidade

| # | Dev | Stars | Followers | Repos |
|---|-----|-------|-----------|-------|
`;
  topByStars.forEach((d, i) => {
    report += `| ${i + 1} | @${d.github_login} | ${formatNum(d.total_stars || 0)} | ${formatNum(d.followers || 0)} | ${d.public_repos} |\n`;
  });

  // Oldest GitHub accounts in the city
  report += `
## Contas mais antigas do GitHub na cidade

| # | Dev | GitHub desde | Contribuicoes |
|---|-----|-------------|--------------|
`;
  oldestAccounts.forEach((d, i) => {
    const year = d.account_created_at?.slice(0, 4) || "?";
    report += `| ${i + 1} | @${d.github_login} | ${year} | ${formatNum(d.contributions_total || d.contributions)} |\n`;
  });

  // Day-over-day growth
  report += `
---

## Crescimento dia a dia

| Dia | Crescimento vs dia anterior |
|-----|-----------------------------|
`;
  for (const { day, growth } of growthRates) {
    report += `| ${day} | +${growth}% |\n`;
  }

  // Funnel
  report += `
---

## Funil de conversao

| Etapa | Numero | Taxa |
|-------|--------|------|
| Visitors (Himetrica 14d) | ~15,000 | 100% |
| Devs adicionados | ${formatNum(devs.length)} | ${((devs.length / 15000) * 100).toFixed(1)}% |
| Devs claimed (logaram) | ${formatNum(claimedDevs.length)} | ${((claimedDevs.length / 15000) * 100).toFixed(1)}% |
| Compraram item (pago) | ${formatNum(paidPurchases.length)} | ${((paidPurchases.length / 15000) * 100).toFixed(2)}% |
| Compraram ad | ${formatNum(uniqueAdCustomers)} | ${((uniqueAdCustomers / 15000) * 100).toFixed(2)}% |

---

## Dados pra Marketing

### Numeros headline (linguagem correta pra marketing)
- ${formatNum(devs.length)} developers represented in the city em ${sortedDays.length} dias
- ${formatNum(claimedDevs.length)} developers logged in and claimed their buildings
- ${formatNum(totalStars)} combined GitHub stars across all developers
- ${formatNum(totalFollowers)} combined followers
- ${formatNum(totalRepos)} public repositories
- ${formatNum(parseInt(impressionCount) || 0)} ad impressions
- ${impressionCount > 0 ? ((clickCount / impressionCount) * 100).toFixed(2) : "0"}% CTR (2x+ industry average)
- ${formatNum(paidAds.length)} ads sold, ${formatNum(uniqueAdCustomers)} unique customers
- Zero marketing spend, 100% organic growth
- Built by a solo developer in 1 week

### Crescimento diario medio
- ${(devs.length / Math.max(sortedDays.length, 1)).toFixed(0)} novos devs/dia
- ${(kudos.length / Math.max(sortedDays.length, 1)).toFixed(0)} kudos/dia
- ${(visits.length / Math.max(sortedDays.length, 1)).toFixed(0)} building visits/dia

### Dados que impressionam investidores/parceiros
- Maior dia: ${Math.max(...Object.values(Object.fromEntries(devsByDay)))} devs em 24h
- Taxa de claim: ${claimRate}% (devs que logaram vs adicionados)
- ${formatNum(repeatAdCustomers.length)} clientes compraram ads multiplos (prova de valor)
- ${topLanguages
    .slice(0, 5)
    .map(([l, c]) => `${l} (${c})`)
    .join(", ")}
`;

  // Write report
  const outputPath = "docs/analytics-report.md";
  fs.writeFileSync(outputPath, report);
  console.log(`Relatorio salvo em: ${outputPath}`);
  console.log(`\nResumo rapido:`);
  console.log(`  Devs: ${formatNum(devs.length)}`);
  console.log(`  Compras: ${formatNum(purchases.length)}`);
  console.log(`  Ads pagos: ${formatNum(paidAds.length)}`);
  console.log(`  Kudos: ${formatNum(kudos.length)}`);
  console.log(`  Visits: ${formatNum(visits.length)}`);
  console.log(`  Achievements: ${formatNum(achievements.length)}`);
  console.log(`  Dias de operacao: ${sortedDays.length}`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
