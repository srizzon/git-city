import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { inHome } from "@/lib/reel/home";

// A file from REELS_HOME (a reel's mix, draft, contact sheet) for the reels
// studio and the export. Dev only: 404 in production or without REELS_HOME.

const TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
};

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.map(decodeURIComponent).join("/");
  const full = inHome(rel);
  if (!full || !existsSync(full) || !statSync(full).isFile()) return new NextResponse(null, { status: 404 });
  return new NextResponse(readFileSync(full), {
    headers: { "Content-Type": TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" },
  });
}
