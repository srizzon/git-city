"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ACCENT = "#c8e64a";

interface ApiKey {
  id: string;
  key_prefix: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/ads/api-keys")
      .then((r) => r.json())
      .then((d) => { setKeys(d.keys ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/ads/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() || "Default" }),
    });
    const data = await res.json();
    if (data.key) {
      setNewKey(data.key);
      setNewLabel("");
      // Refresh list
      const listRes = await fetch("/api/ads/api-keys");
      const listData = await listRes.json();
      setKeys(listData.keys ?? []);
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/ads/api-keys?id=${id}`, { method: "DELETE" });
    setKeys(keys.map((k) => k.id === id ? { ...k, revoked_at: new Date().toISOString() } : k));
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  return (
    <div>
      <Link href="/ads/dashboard" className="text-sm text-muted transition-colors hover:text-cream">&larr; Dashboard</Link>
      <h1 className="mt-4 text-xl text-cream">API Keys</h1>
      <p className="mt-1 text-sm text-muted normal-case">
        Use API keys to access your ad stats programmatically.
      </p>

      {/* Show newly created key */}
      {newKey && (
        <div className="mt-4 border-[3px] p-4" style={{ borderColor: ACCENT, backgroundColor: `${ACCENT}08` }}>
          <p className="text-sm text-cream">Your new API key (shown once):</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto bg-bg px-3 py-2 text-xs text-cream normal-case">{newKey}</code>
            <button
              type="button"
              onClick={copyKey}
              className="shrink-0 border-[2px] border-border px-3 py-2 text-xs text-muted transition-colors hover:text-cream"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="mt-2 text-xs text-muted"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key */}
      <div className="mt-5 border-[3px] border-border p-4">
        <h2 className="text-base text-cream">Create New Key</h2>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (e.g. CI/CD)"
            maxLength={100}
            className="flex-1 border-[3px] border-border bg-transparent px-3 py-2 font-pixel text-xs text-cream outline-none transition-colors focus:border-[#c8e64a] normal-case"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="btn-press px-4 py-2 text-xs text-bg"
            style={{ backgroundColor: ACCENT }}
          >
            {creating ? "..." : "Create"}
          </button>
        </div>
      </div>

      {/* Active keys */}
      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading...</p>
      ) : (
        <>
          <div className="mt-5">
            <h2 className="mb-2 text-base text-cream">Active Keys ({activeKeys.length})</h2>
            {activeKeys.length === 0 ? (
              <p className="text-sm text-muted normal-case">No active API keys.</p>
            ) : (
              <div className="space-y-2">
                {activeKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between border-[2px] border-border px-4 py-3">
                    <div>
                      <p className="text-xs text-cream normal-case">{k.label}</p>
                      <p className="text-xs text-muted normal-case">
                        {k.key_prefix}... &middot; Created {new Date(k.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.id)}
                      className="text-xs text-[#ff6b6b] transition-opacity hover:opacity-80"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {revokedKeys.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-2 text-base text-muted">Revoked ({revokedKeys.length})</h2>
              <div className="space-y-1">
                {revokedKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between border-[2px] border-border px-4 py-3 opacity-50">
                    <p className="text-xs text-muted normal-case">{k.label} &middot; {k.key_prefix}...</p>
                    <p className="text-xs text-muted normal-case">revoked</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Docs */}
      <div className="mt-6 border-[3px] border-border p-4">
        <h2 className="text-base text-cream">Quick Reference</h2>
        <div className="mt-3 space-y-3 text-xs text-muted normal-case">
          <div>
            <p className="text-sm text-cream">List your ads</p>
            <code className="mt-1 block overflow-x-auto bg-bg px-3 py-2">curl -H &quot;Authorization: Bearer YOUR_KEY&quot; https://thegitcity.com/api/v1/ads</code>
          </div>
          <div>
            <p className="text-sm text-cream">Get stats for an ad</p>
            <code className="mt-1 block overflow-x-auto bg-bg px-3 py-2">curl -H &quot;Authorization: Bearer YOUR_KEY&quot; https://thegitcity.com/api/v1/ads/AD_ID/stats?period=30d</code>
          </div>
          <div>
            <p className="text-sm text-cream">Get audience profile</p>
            <code className="mt-1 block overflow-x-auto bg-bg px-3 py-2">curl -H &quot;Authorization: Bearer YOUR_KEY&quot; https://thegitcity.com/api/v1/ads/AD_ID/audience</code>
          </div>
        </div>
      </div>
    </div>
  );
}
