/**
 * Indexes buildings for auth users who logged in but were never fetched from GitHub.
 *
 * Usage:
 *   npx tsx scripts/index-missing-devs.ts
 *   npx tsx scripts/index-missing-devs.ts --dry-run
 *   npx tsx scripts/index-missing-devs.ts --concurrency=3
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "2"
);
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getMissingLogins(): Promise<string[]> {
  const logins: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await sb
      .rpc("get_auth_users_without_developer")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data as { github_login: string }[]) ?? [];
    logins.push(...rows.map((r) => r.github_login));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return logins;
}

async function indexDev(login: string): Promise<"ok" | "fail"> {
  try {
    const res = await fetch(`${BASE_URL}/api/dev/${login}`, {
      headers: { "x-internal-backfill": process.env.SUPABASE_SERVICE_ROLE_KEY! },
    });
    return res.ok ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

async function runBatch(logins: string[], concurrency: number) {
  let ok = 0, fail = 0, i = 0;

  async function worker() {
    while (i < logins.length) {
      const login = logins[i++];
      const result = await indexDev(login);
      if (result === "ok") ok++; else fail++;
      process.stdout.write(
        `\r[${ok + fail}/${logins.length}] ok=${ok} fail=${fail}  `
      );
      // Respect GitHub rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

async function main() {
  console.log("Fetching auth users without a developer record...");
  const missing = await getMissingLogins();
  console.log(`Found ${missing.length} missing devs.`);

  if (DRY_RUN) {
    console.log("Dry run, first 20:", missing.slice(0, 20));
    return;
  }

  console.log(`Indexing with concurrency=${CONCURRENCY} (~500ms between each per worker)...`);
  await runBatch(missing, CONCURRENCY);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
