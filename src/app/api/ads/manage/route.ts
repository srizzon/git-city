import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { containsBlockedContent, isSuspiciousLink } from "@/lib/ad-moderation";
import { MAX_TEXT_LENGTH } from "@/lib/skyAds";

export async function POST(request: NextRequest) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    ad_id?: string;
    action?: string;
    brand?: string;
    text?: string;
    description?: string | null;
    link?: string | null;
    color?: string;
    bgColor?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ad_id, action } = body;
  if (!ad_id || !action) {
    return NextResponse.json({ error: "Missing ad_id or action" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // Verify ownership
  const { data: ad } = await sb
    .from("sky_ads")
    .select("id, active")
    .eq("id", ad_id)
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (action) {
    case "pause": {
      await sb.from("sky_ads").update({ active: false }).eq("id", ad_id);
      return NextResponse.json({ ok: true });
    }
    case "activate": {
      await sb.from("sky_ads").update({ active: true }).eq("id", ad_id);
      return NextResponse.json({ ok: true });
    }
    case "update": {
      const updates: Record<string, unknown> = {};

      if (body.brand !== undefined) {
        const brand = body.brand.trim();
        if (brand.length === 0 || brand.length > 40) {
          return NextResponse.json({ error: "Brand must be 1-40 characters" }, { status: 400 });
        }
        const mod = containsBlockedContent(brand);
        if (mod.blocked) {
          return NextResponse.json({ error: mod.reason ?? "Content not allowed" }, { status: 400 });
        }
        updates.brand = brand;
      }

      if (body.text !== undefined) {
        const text = body.text.trim();
        if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
          return NextResponse.json({ error: `Text must be 1-${MAX_TEXT_LENGTH} characters` }, { status: 400 });
        }
        const mod = containsBlockedContent(text);
        if (mod.blocked) {
          return NextResponse.json({ error: mod.reason ?? "Content not allowed" }, { status: 400 });
        }
        updates.text = text;
      }

      if (body.description !== undefined) {
        if (body.description && typeof body.description === "string") {
          const desc = body.description.trim();
          if (desc.length > 200) {
            return NextResponse.json({ error: "Description must be 200 characters or less" }, { status: 400 });
          }
          const mod = containsBlockedContent(desc);
          if (mod.blocked) {
            return NextResponse.json({ error: mod.reason ?? "Content not allowed" }, { status: 400 });
          }
          updates.description = desc;
        } else {
          updates.description = null;
        }
      }

      if (body.link !== undefined) {
        if (body.link && typeof body.link === "string") {
          if (!body.link.startsWith("https://") && !body.link.startsWith("mailto:")) {
            return NextResponse.json({ error: "Link must start with https:// or mailto:" }, { status: 400 });
          }
          if (isSuspiciousLink(body.link)) {
            return NextResponse.json({ error: "Link flagged as suspicious" }, { status: 400 });
          }
          updates.link = body.link;
        } else {
          updates.link = null;
        }
      }

      if (body.color) {
        if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) {
          return NextResponse.json({ error: "Invalid text color" }, { status: 400 });
        }
        updates.color = body.color;
      }

      if (body.bgColor) {
        if (!/^#[0-9a-fA-F]{6}$/.test(body.bgColor)) {
          return NextResponse.json({ error: "Invalid background color" }, { status: 400 });
        }
        updates.bg_color = body.bgColor;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No updates provided" }, { status: 400 });
      }

      await sb.from("sky_ads").update(updates).eq("id", ad_id);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
