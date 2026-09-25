import { NextResponse } from "next/server";
import { surpriseTown } from "@/lib/towns/discover";

export const dynamic = "force-dynamic";

// GET: a random town with 5+ buildings ({slug}), or {slug: null} when none.
export async function GET() {
  try {
    return NextResponse.json({ slug: await surpriseTown() });
  } catch (err) {
    console.error("[towns] surprise failed:", err);
    return NextResponse.json({ slug: null }, { status: 500 });
  }
}
