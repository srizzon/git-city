import { getSupabaseAdmin } from "@/lib/supabase";

const KEY_PREFIX = "gc_ak_";

export async function generateApiKey(advertiserId: string, label: string): Promise<{ key: string; id: string }> {
  const sb = getSupabaseAdmin();

  // Generate random key
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `${KEY_PREFIX}${hex}`;

  // Hash the key
  const hash = await hashKey(key);
  const prefix = key.slice(0, KEY_PREFIX.length + 8);

  const { data, error } = await sb
    .from("advertiser_api_keys")
    .insert({
      advertiser_id: advertiserId,
      key_hash: hash,
      key_prefix: prefix,
      label,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { key, id: data.id };
}

export async function verifyApiKey(key: string): Promise<string | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;

  const sb = getSupabaseAdmin();
  const hash = await hashKey(key);

  const { data } = await sb
    .from("advertiser_api_keys")
    .select("advertiser_id")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();

  return data?.advertiser_id ?? null;
}

export async function revokeApiKey(keyId: string, advertiserId: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("advertiser_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("advertiser_id", advertiserId)
    .is("revoked_at", null)
    .select("id");

  return (data?.length ?? 0) > 0;
}

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
