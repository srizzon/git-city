#!/usr/bin/env node
// Upload public/cozy/ contents to the `arcade-assets` Supabase bucket.
// Run once before deploying to production (or after updating assets):
//
//   node --env-file=.env.local scripts/upload-arcade-assets.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const BUCKET = "arcade-assets";
const SOURCE_DIR = "public/cozy";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey);

const CONTENT_TYPES = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

async function ensureBucket() {
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (data) return;
  if (error && !error.message.toLowerCase().includes("not found")) {
    throw error;
  }
  const { error: createErr } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
  });
  if (createErr) throw createErr;
  console.log(`Created bucket ${BUCKET}`);
}

async function main() {
  await ensureBucket();

  const files = walk(SOURCE_DIR);
  console.log(`Uploading ${files.length} files to ${BUCKET}...`);

  let ok = 0;
  let fail = 0;
  const concurrency = 8;
  let idx = 0;

  async function worker() {
    while (idx < files.length) {
      const i = idx++;
      const file = files[i];
      const key = relative(SOURCE_DIR, file).split("\\").join("/");
      const ext = extname(file).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
      const body = readFileSync(file);

      const { error } = await sb.storage.from(BUCKET).upload(key, body, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });

      if (error) {
        console.error(`  ✗ ${key}: ${error.message}`);
        fail++;
      } else {
        ok++;
        if (ok % 25 === 0) console.log(`  ${ok}/${files.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log(`\nDone. ${ok} uploaded, ${fail} failed.`);
  console.log(`Public URL base: ${supabaseUrl}/storage/v1/object/public/${BUCKET}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
