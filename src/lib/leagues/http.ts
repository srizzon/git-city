import "server-only";
import { NextResponse } from "next/server";
import { LeagueError } from "./service";

/** Maps LeagueError (and unexpected errors) to JSON responses. */
export function leagueErrorResponse(err: unknown): NextResponse {
  if (err instanceof LeagueError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error("[leagues]", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
