import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SetupContent } from "./SetupContent";

const ACCENT = "#c8e64a";

export const metadata: Metadata = {
  title: "Set Up Your Ad - Git City",
  robots: { index: false, follow: false },
};

const VEHICLE_LABELS: Record<string, string> = {
  plane: "Plane",
  blimp: "Blimp",
  billboard: "Billboard",
  rooftop_sign: "Rooftop Sign",
  led_wrap: "LED Wrap",
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function SetupPage({ params }: Props) {
  const { token } = await params;

  if (!token || token.length < 10) notFound();

  const sb = getSupabaseAdmin();

  const { data: ad } = await sb
    .from("sky_ads")
    .select("id, text, color, bg_color, vehicle, brand, description, link")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!ad) notFound();

  const vehicleLabel = VEHICLE_LABELS[ad.vehicle] ?? ad.vehicle;

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Success header */}
        <div className="text-center">
          <p className="text-3xl" style={{ color: ACCENT }}>
            +
          </p>
          <h1 className="mt-2 text-2xl text-cream">
            Your ad is <span style={{ color: ACCENT }}>live!</span>
          </h1>
          <p className="mt-3 text-xs text-muted normal-case">
            Payment confirmed. Your ad is now running in the city.
          </p>
        </div>

        <SetupContent token={token} ad={ad} vehicleLabel={vehicleLabel} />
      </div>
    </main>
  );
}
