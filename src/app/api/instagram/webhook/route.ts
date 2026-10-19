import { NextResponse, after } from "next/server";
import { validInstagramSignature } from "@/lib/instagram";
import { handleBrasilComments, handleStoryMentions, type IncomingComment } from "@/lib/towns/brasil-instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Instagram webhook ───────────────────────────────────────
// Meta calls this for every comment on the connected account's posts and
// every message it gets (a story tagging the account arrives as one), signed
// with the app secret. Meta wants a 200 fast and retries otherwise, so both
// are handled after the response (brasil-instagram.ts).

interface WebhookBody {
  entry?: {
    id: string;
    changes?: {
      field: string;
      value: { id: string; text?: string; parent_id?: string; from?: { id: string; username?: string }; media?: { id: string } };
    }[];
    messaging?: {
      sender?: { id: string };
      message?: { mid?: string; is_echo?: boolean; attachments?: { type: string }[] };
    }[];
  }[];
}

// GET: Meta's check when the callback URL is saved in the dashboard.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.INSTAGRAM_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  // Meta's payloads are small; anything big is someone else.
  if (raw.length > 64_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  if (!validInstagramSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  const body = JSON.parse(raw) as WebhookBody;
  // The account's own comments (its replies included) never count.
  const comments: IncomingComment[] = (body.entry ?? []).flatMap((e) =>
    (e.changes ?? [])
      .filter((c) => c.field === "comments" && c.value.text && c.value.media?.id && c.value.from?.id !== e.id)
      .map((c) => ({ id: c.value.id, mediaId: c.value.media!.id, text: c.value.text!, igUser: c.value.from?.username?.toLowerCase() ?? null, parentId: c.value.parent_id })),
  );
  // A story that tags the account: a message with a story_mention attachment, from someone else.
  const stories = (body.entry ?? []).flatMap((e) =>
    (e.messaging ?? [])
      .filter((m) => m.sender?.id && m.sender.id !== e.id && !m.message?.is_echo && m.message?.attachments?.some((a) => a.type === "story_mention"))
      .map((m) => ({ sender: m.sender!.id, mid: m.message?.mid ?? null })),
  );
  if (comments.length) after(() => handleBrasilComments(comments));
  if (stories.length) after(() => handleStoryMentions(stories));
  return NextResponse.json({ ok: true });
}
