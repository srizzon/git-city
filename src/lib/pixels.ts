import { getSupabaseAdmin } from "./supabase";

export interface WalletBalance {
  balance: number;
  lifetime_earned: number;
  lifetime_bought: number;
  lifetime_spent: number;
}

export async function getBalance(developerId: number): Promise<WalletBalance> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("wallets")
    .select("balance, lifetime_earned, lifetime_bought, lifetime_spent")
    .eq("developer_id", developerId)
    .maybeSingle();

  return data ?? { balance: 0, lifetime_earned: 0, lifetime_bought: 0, lifetime_spent: 0 };
}

export async function earnPixels(
  developerId: number,
  earnRuleId: string,
  referenceId?: string,
  idempotencyKey?: string,
): Promise<{ success: boolean; earned?: number; error?: string }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("earn_pixels", {
    p_developer_id: developerId,
    p_earn_rule_id: earnRuleId,
    p_reference_id: referenceId ?? null,
    p_reference_type: null,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) return { success: false, error: error.message };
  const result = data as { success?: boolean; error?: string; earned?: number };
  if (result.error) return { success: false, error: result.error };
  return { success: true, earned: result.earned };
}
