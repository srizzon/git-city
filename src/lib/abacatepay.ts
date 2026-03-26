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
  extraMetadata?: Record<string, string>;
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
      metadata: { externalId: opts.externalId, ...opts.extraMetadata },
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

/** Pixel packages: looks up price from DB. */
export async function createPixQrCodeForPackage(
  packageId: string,
  developerId: number,
  githubLogin: string,
): Promise<{ brCode: string; brCodeBase64: string; pixId: string }> {
  const sb = getSupabaseAdmin();
  const { data: pkg } = await sb
    .from("pixel_packages")
    .select("*")
    .eq("id", packageId)
    .eq("is_active", true)
    .single();
  if (!pkg) throw new Error("Package not found");

  return createPixQrCodeRaw({
    amountCents: pkg.price_brl_cents,
    description: `${pkg.pixels + pkg.bonus_pixels} Pixels - ${githubLogin}`,
    externalId: `px:${developerId}:${packageId}`,
  });
}
