import { getSupabaseAdmin } from "./supabase";

const ABACATEPAY_API = "https://api.abacatepay.com/v1";

interface PixQrCodeResponse {
  data: {
    id: string;
    brCode: string;
    brCodeBase64: string;
    status: string;
  };
}

/** Low-level: create a PIX QR code with explicit amount/description. */
export async function createPixQrCodeRaw(opts: {
  amountCents: number;
  description: string;
  externalId: string;
}): Promise<{ brCode: string; brCodeBase64: string; pixId: string }> {
  if (!process.env.ABACATEPAY_API_KEY) {
    throw new Error("ABACATEPAY_API_KEY is not set");
  }

  const res = await fetch(`${ABACATEPAY_API}/pixQrCode/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ABACATEPAY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: opts.amountCents,
      expiresIn: 900,
      description: opts.description,
      metadata: { externalId: opts.externalId },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AbacatePay error: ${res.status} ${text}`);
  }

  const data: PixQrCodeResponse = await res.json();

  if (!data?.data?.brCode || !data?.data?.id) {
    throw new Error(`AbacatePay: unexpected response: ${JSON.stringify(data)}`);
  }

  return {
    brCode: data.data.brCode,
    brCodeBase64: data.data.brCodeBase64,
    pixId: data.data.id,
  };
}

/** Shop items: looks up price from DB. */
export async function createPixQrCode(
  itemId: string,
  developerId: number,
  githubLogin: string
): Promise<{ brCode: string; brCodeBase64: string; pixId: string }> {
  const sb = getSupabaseAdmin();

  const { data: item, error } = await sb
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("is_active", true)
    .single();

  if (error || !item) {
    throw new Error("Item not found or inactive");
  }

  return createPixQrCodeRaw({
    amountCents: item.price_brl_cents,
    description: `${item.name} - ${githubLogin}`,
    externalId: `${developerId}:${itemId}`,
  });
}
