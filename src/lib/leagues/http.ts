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

/**
 * CSRF guard for league mutations: the browser's Origin must be this host (or
 * the worktree's PORTLESS_URL locally). Returns a 403 response, or null when
 * the request may proceed.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let ok = false;
  if (origin) {
    try {
      const o = new URL(origin);
      ok = o.host === host || (!!process.env.PORTLESS_URL && o.origin === new URL(process.env.PORTLESS_URL).origin);
    } catch {
      ok = false;
    }
  }
  return ok ? null : NextResponse.json({ error: "Bad origin." }, { status: 403 });
}
