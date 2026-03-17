"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { LiveSession } from "@/lib/useCodingPresence";

const CREATOR_LOGIN = "srizzon";

interface PresenceDev {
  githubLogin: string;
  avatarUrl: string;
  status: string;
  language: string | null;
}

export default function LivePage() {
  const [developers, setDevelopers] = useState<PresenceDev[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    const fetchPresence = () => {
      fetch("/api/presence")
        .then((r) => r.json())
        .then((data) => {
          if (data.developers) {
            // Creator first, then alphabetical
            const sorted = [...data.developers].sort((a: PresenceDev, b: PresenceDev) => {
              if (a.githubLogin.toLowerCase() === CREATOR_LOGIN) return -1;
              if (b.githubLogin.toLowerCase() === CREATOR_LOGIN) return 1;
              return a.githubLogin.localeCompare(b.githubLogin);
            });
            setDevelopers(sorted);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/"
            className="mb-5 inline-block text-xs text-muted transition-colors hover:text-cream"
          >
            &larr; Back to city
          </Link>
          <div className="flex items-center gap-3">
            <span className="live-dot h-3 w-3 rounded-full bg-[#4ade80]" />
            <h1 className="text-2xl text-cream">Live Now</h1>
            <span className="text-xs text-muted">
              {developers.length} developer{developers.length !== 1 ? "s" : ""} coding
            </span>
          </div>
          <p className="mt-3 text-xs normal-case text-muted">
            These developers are keeping the city alive. Their buildings are glowing right now.
          </p>
          <p className="mt-1 text-[10px] normal-case text-muted/60">
            Only username and language are shown. Developers control what they share via VS Code settings.
          </p>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted">Loading...</div>
        ) : developers.length === 0 ? (
          <div className="border-[3px] border-border bg-bg/50 p-10 text-center">
            <p className="mb-2 text-sm text-cream">The city is dark right now</p>
            <p className="text-xs normal-case text-muted">
              No one is coding. Install Pulse to be the first to light it up.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {developers.map((dev) => {
              const isCreator = dev.githubLogin.toLowerCase() === CREATOR_LOGIN;
              return (
                <Link
                  key={dev.githubLogin}
                  href={`/?focus=${dev.githubLogin}`}
                  className="flex items-center gap-4 border-[3px] border-border bg-bg/50 px-5 py-4 transition-colors hover:border-border-light"
                >
                  <div className="relative shrink-0">
                    <img
                      src={dev.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full"
                      style={isCreator ? { boxShadow: "0 0 8px #fbbf24" } : undefined}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg ${isCreator ? "bg-[#fbbf24]" : "bg-[#4ade80]"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isCreator ? "text-[#fbbf24]" : "text-cream"}`}>
                        {dev.githubLogin}
                      </span>
                      {isCreator && (
                        <span className="text-[9px] text-[#fbbf24]/70">CREATOR</span>
                      )}
                      {dev.status === "idle" && (
                        <span className="text-[9px] text-muted">IDLE</span>
                      )}
                    </div>
                    <div className="text-[10px] normal-case text-muted">
                      {isCreator ? "building the city" : dev.language || "coding"}
                    </div>
                  </div>
                  <span className="text-xs text-muted">&rarr;</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 border-[3px] border-border bg-bg/50 p-8 text-center">
          <p className="mb-2 text-sm text-cream">The city needs your signal</p>
          <p className="mb-5 text-xs normal-case text-muted">
            Every dev who codes keeps a building lit. Install Pulse to power yours.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://marketplace.visualstudio.com/items?itemName=git-city.gitcity"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-block px-8 py-3 text-xs text-bg"
              style={{ backgroundColor: "#4ade80", boxShadow: "2px 2px 0 0 #16a34a" }}
            >
              Get Pulse for VS Code
            </a>
            <button
              onClick={() => setShowSetupModal(true)}
              className="btn-press inline-block px-8 py-3 text-xs text-cream border-[2px] border-[#4ade80] bg-bg"
              style={{ boxShadow: "2px 2px 0 0 #16a34a" }}
            >
              Get Pulse for Neovim
            </button>
          </div>
        </div>
      </div>

      {/* ─── Neovim Setup Modal ─── */}
      {showSetupModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm p-4"
          onClick={() => setShowSetupModal(false)}
        >
          <div 
            className="w-full max-w-md border-[3px] border-border bg-bg p-6 sm:p-8 animate-[slide-up_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl text-cream">Neovim Setup</h2>
              <button 
                onClick={() => setShowSetupModal(false)}
                className="text-muted hover:text-cream transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6 text-sm text-muted normal-case">
              <div>
                <p className="mb-2"><span className="text-cream text-xs uppercase tracking-widest block mb-1">Step 1</span></p>
                <p>Install the <a href="https://github.com/srizzon/git-city/tree/main/packages/neovim-plugin" target="_blank" rel="noopener noreferrer" className="text-[#4ade80] hover:underline">gitcity.nvim</a> plugin using your preferred package manager.</p>
              </div>

              <div>
                <p className="mb-2"><span className="text-cream text-xs uppercase tracking-widest block mb-1">Step 2</span></p>
                {!apiKey ? (
                  <>
                    <p className="mb-3">Generate your universal Git City API key.</p>
                    <button
                      onClick={async () => {
                        setLoadingKey(true);
                        try {
                          const res = await fetch("/api/neovim-key", { method: "POST" });
                          const data = await res.json();
                          if (data.key) {
                            setApiKey(data.key);
                            navigator.clipboard.writeText(data.key);
                            setKeyCopied(true);
                            setTimeout(() => setKeyCopied(false), 2000);
                          }
                        } finally {
                          setLoadingKey(false);
                        }
                      }}
                      disabled={loadingKey}
                      className="btn-press w-full py-2.5 text-center text-xs text-bg"
                      style={{ backgroundColor: "#4ade80", boxShadow: "2px 2px 0 0 #16a34a" }}
                    >
                      {loadingKey ? "Generating..." : "Generate API Key"}
                    </button>
                  </>
                ) : (
                  <div>
                    <p className="mb-2 text-cream font-bold">Your API Key</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate bg-white/5 px-3 py-2 text-[11px] normal-case text-cream border border-border">
                        {apiKey}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(apiKey);
                          setKeyCopied(true);
                          setTimeout(() => setKeyCopied(false), 2000);
                        }}
                        className="btn-press shrink-0 border border-border px-4 py-2 text-[11px] text-cream transition-colors hover:border-border-light bg-bg"
                        style={{ boxShadow: "2px 2px 0 0 var(--color-border)" }}
                      >
                        {keyCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2"><span className="text-cream text-xs uppercase tracking-widest block mb-1">Step 3</span></p>
                <p>In Neovim, run <code>:GitCityLogin</code> and paste the key. Your building will light up in ~30 seconds.</p>
              </div>
            </div>
            
            <p className="mt-8 text-[10px] normal-case text-muted/50 text-center">
              Only your username and language are shared publicly. Control what gets sent in your Neovim plugin settings.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
