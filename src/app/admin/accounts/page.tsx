"use client";

import { useState } from "react";

interface Account {
  id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  claimed: boolean;
  claimed_by: string | null;
  created_at: string;
  xp_total: number | null;
  last_active_at: string | null;
}

const input = "w-full border border-border bg-bg px-3 py-2 text-[12px] text-cream outline-none placeholder:text-dim focus:border-lime/50";

// Deletion requests sent by email. Delete only when the email on file is the
// one that wrote in; the login goes with every building it claimed.
export default function AccountsPage() {
  const [q, setQ] = useState("");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [confirm, setConfirm] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setNote(null);
    const res = await fetch(`/api/admin/accounts?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const json = (await res.json()) as { accounts?: Account[] };
    setAccounts(json.accounts ?? []);
  };

  const erase = async (a: Account) => {
    setBusy(a.id);
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ developer_id: a.id, confirm: confirm[a.id] ?? "" }),
    });
    const json = (await res.json()) as { error?: string; deleted?: string[] };
    setBusy(null);
    if (!res.ok) {
      setNote(json.error ?? "Delete failed");
      return;
    }
    setNote(`Deleted ${json.deleted?.join(", ")}`);
    setAccounts((list) => list?.filter((x) => !json.deleted?.includes(x.github_login)) ?? null);
  };

  return (
    <div className="min-h-screen bg-bg p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-sm text-cream">Account deletion</h1>
        <p className="mt-1 text-[11px] text-muted">Delete only when the email on file matches the one that wrote in.</p>

        <form onSubmit={search} className="mt-6 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="github username or email" className={input} />
          <button type="submit" className="shrink-0 border border-border px-4 py-2 text-[11px] text-cream">
            Find
          </button>
        </form>

        {note && <p className="mt-4 text-[11px] text-lime">{note}</p>}
        {accounts?.length === 0 && <p className="mt-8 text-[11px] text-muted">No account found.</p>}

        <div className="mt-6 space-y-3">
          {accounts?.map((a) => (
            <div key={a.id} className="border border-border bg-bg-raised p-4">
              <div className="flex items-baseline justify-between gap-2">
                <a href={`/dev/${a.github_login}`} className="truncate text-xs text-cream hover:text-lime">
                  @{a.github_login}
                  {a.name ? <span className="text-muted"> · {a.name}</span> : null}
                </a>
                <span className="shrink-0 text-[10px] text-dim">{a.claimed ? "claimed" : "not claimed"}</span>
              </div>
              <p className="mt-2 break-words text-[11px] text-muted">
                <span className="font-mono normal-case text-cream">{a.email ?? "no email on file"}</span> · joined {a.created_at.slice(0, 10)}
                {a.last_active_at ? ` · last seen ${a.last_active_at.slice(0, 10)}` : ""} · {a.xp_total ?? 0} XP
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={confirm[a.id] ?? ""}
                  onChange={(e) => setConfirm((c) => ({ ...c, [a.id]: e.target.value }))}
                  placeholder={`type ${a.github_login}`}
                  autoComplete="off"
                  className={input}
                />
                <button
                  type="button"
                  disabled={busy === a.id || (confirm[a.id] ?? "").trim().toLowerCase() !== a.github_login.toLowerCase()}
                  onClick={() => erase(a)}
                  className="shrink-0 border border-red-400/60 px-4 py-2 text-[11px] text-red-300 disabled:opacity-40"
                >
                  {busy === a.id ? "Deleting…" : "Delete account"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
