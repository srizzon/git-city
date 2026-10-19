import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardReel } from "@/lib/reel/board";
import { reelsHome } from "@/lib/reel/home";
import { specDir } from "@/lib/reel/spec";
import { NoteBox, RefreshWhileQueued, ReelButtons, ScriptEditor, StateTag } from "../ui";

// One reel's review page (dev only): the latest render to watch, the loop it
// closes, the script as a table, the checks, the contact sheet, the post,
// Sam's notes, and the button that moves it to its next step.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reel - Git City",
  robots: { index: false, follow: false },
};

const section = "flex flex-col gap-3 border border-border bg-bg-raised p-4";
const h2 = "text-[11px] uppercase tracking-wider text-dim";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  if (!reelsHome()) notFound();
  const { id } = await params;
  const r = boardReel(id);
  if (!r) notFound();
  const video = r.files.final ?? r.files.draft;
  const fails = r.checks.filter((c) => c.level === "fail");
  const { date } = specDir(id);

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <RefreshWhileQueued queued={!!r.status.queued} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <Link href={`/reels?date=${date}`} className="text-[11px] text-muted hover:text-cream">
            ← Reels · {date}
          </Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-sm text-cream">{r.spec?.kind === "main" ? "Main" : `Trial · ${r.slot}`}{r.spec?.preset ? ` · ${r.spec.preset}` : ""}</h1>
            <StateTag status={r.status} />
            {r.length && <span className="text-[11px] text-muted">{r.length.toFixed(1)}s</span>}
          </div>
        </div>

        {r.error && <p className="border border-red-400 p-3 text-[11px] normal-case text-red-400">{r.error}</p>}

        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[9/16] overflow-hidden border border-border bg-bg">
              {video ? (
                <video key={video} src={video} controls playsInline className="h-full w-full object-contain" />
              ) : (
                <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] text-muted">Nothing rendered yet</p>
              )}
            </div>
            <div className="flex gap-3 text-[11px]">
              {r.files.final && r.files.draft && (
                <a href={r.files.draft} target="_blank" rel="noreferrer" className="text-muted hover:text-cream">
                  Draft
                </a>
              )}
              {r.status.state !== "script" && (
                <Link href={`/reels/${id}/studio`} className="text-muted hover:text-cream">
                  Live studio
                </Link>
              )}
            </div>
            {r.spec && <ReelButtons id={id} status={r.status} hasFailures={fails.length > 0} />}
          </div>

          <div className="flex flex-col gap-4">
            {r.spec?.loop && (
              <section className={section}>
                <h2 className={h2}>The loop</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
                  {(
                    [
                      ["Comment", r.spec.loop.comment],
                      ["Changes", r.spec.loop.change],
                      ["On screen", r.spec.loop.who],
                      ["Why now", r.spec.loop.now],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="normal-case text-cream">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {r.spec && (
              <section className={section}>
                <h2 className={h2}>Script</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-dim">
                      <tr>
                        <th className="py-1 pr-3 font-normal">Time</th>
                        <th className="py-1 pr-3 font-normal">Scene</th>
                        <th className="py-1 font-normal">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.rows.map((row, i) => (
                        <tr key={i} className="border-t border-border align-top">
                          <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{row.at === null ? "–" : row.at.toFixed(1)}</td>
                          <td className="whitespace-nowrap py-1.5 pr-3 text-cream-dark">{row.scene ?? ""}</td>
                          <td className="py-1.5 normal-case">
                            <span className="text-cream">
                              {row.show.split(/(\*[^*]+\*)/).map((p, k) => (p.startsWith("*") ? <span key={k} className="text-lime">{p.slice(1, -1)}</span> : p))}
                            </span>
                            {row.say !== row.show.replace(/\*/g, "") && <span className="block text-[10px] text-dim">says “{row.say}”</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ScriptEditor id={id} lines={r.rows.map((x) => ({ show: x.show, say: x.say }))} editable={r.status.state !== "posted" && r.status.state !== "scheduled"} />
              </section>
            )}

            {r.checks.length > 0 && (
              <section className={section}>
                <h2 className={h2}>Checks on the draft</h2>
                <ul className="flex flex-col gap-1 text-[11px] normal-case">
                  {r.checks.map((c, i) => (
                    <li key={i} className={c.level === "fail" ? "text-red-400" : "text-cream"}>
                      {c.level === "fail" ? "✗" : "!"} {c.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(r.files.finalSheet ?? r.files.sheet) && (
              <section className={section}>
                <h2 className={h2}>Contact sheet</h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.files.finalSheet ?? r.files.sheet} alt="Contact sheet: a frame every two thirds of a second" className="w-full border border-border" />
              </section>
            )}

            {r.spec && (
              <section className={section}>
                <h2 className={h2}>Post</h2>
                <p className="whitespace-pre-wrap text-[11px] normal-case text-cream">{r.spec.post.caption || "No caption yet."}</p>
                <p className="text-[10px] text-muted">
                  {r.spec.kind === "main" ? "Main reel, with its cover" : "Trial reel, no cover (Instagram graduates it if it does well)"}
                  {r.spec.post.watch ? " · its comments go on the Brasil map" : ""}
                </p>
              </section>
            )}

            <section className={section}>
              <h2 className={h2}>Notes</h2>
              {r.notes && <pre className="whitespace-pre-wrap font-[inherit] text-[11px] normal-case text-cream">{r.notes}</pre>}
              <NoteBox id={id} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
