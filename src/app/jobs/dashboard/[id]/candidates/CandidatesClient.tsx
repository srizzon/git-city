"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BADGE_INFO } from "@/lib/jobs/quality-score";
import type { CandidateBadge, CandidateWithScore } from "@/lib/jobs/types";
import { SENIORITY_LABELS } from "@/lib/jobs/constants";

interface Funnel {
  views: number;
  applies: number;
  profiles: number;
  hired: number;
}

interface DailyPoint {
  date: string;
  views: number;
  applies: number;
}

interface PerformanceData {
  funnel: Funnel;
  daily: DailyPoint[];
  topSkills: { skill: string; count: number }[];
  seniorityBreakdown: Record<string, number>;
  totalApplicants: number;
  applicantsWithProfile: number;
}

interface CandidatesData {
  candidates: CandidateWithScore[];
  withProfile: number;
  withoutProfile: number;
  hiredCount: number;
}

const SORT_OPTIONS = [
  { value: "best_match", label: "Best Match" },
  { value: "recent", label: "Most Recent" },
  { value: "stars", label: "Most Stars" },
  { value: "streak", label: "Longest Streak" },
  { value: "skill_match", label: "Skill Match" },
];

export default function CandidatesClient({ listingId }: { listingId: string }) {
  const [perf, setPerf] = useState<PerformanceData | null>(null);
  const [candidates, setCandidates] = useState<CandidatesData | null>(null);
  const [sort, setSort] = useState("best_match");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/jobs/dashboard/${listingId}/performance`).then((r) => r.json()),
      fetch(`/api/jobs/dashboard/${listingId}/candidates?sort=${sort}`).then((r) => r.json()),
    ]).then(([perfData, candData]) => {
      setPerf(perfData);
      setCandidates(candData);
      setLoading(false);
    });
  }, [listingId, sort]);

  async function handleStatusChange(devId: number, status: "applied" | "hired") {
    setUpdating(devId);
    const res = await fetch(`/api/jobs/${listingId}/candidates/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ developer_id: devId, status }),
    });
    if (res.ok && candidates) {
      setCandidates({
        ...candidates,
        candidates: candidates.candidates.map((c) =>
          c.developer_id === devId ? { ...c, status } : c,
        ),
        hiredCount: candidates.candidates.filter((c) =>
          c.developer_id === devId ? status === "hired" : c.status === "hired",
        ).length,
      });
    }
    setUpdating(null);
  }

  async function handleExport() {
    window.open(`/api/jobs/${listingId}/candidates/export`, "_blank");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="h-6 w-48 animate-pulse bg-border" />
          <div className="mt-6 grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="border-[3px] border-border bg-bg-raised p-4 h-20 animate-pulse" />)}
          </div>
        </div>
      </main>
    );
  }

  const funnel = perf?.funnel ?? { views: 0, applies: 0, profiles: 0, hired: 0 };
  const viewToApply = funnel.views > 0 ? ((funnel.applies / funnel.views) * 100).toFixed(1) : "0";
  const applyToHired = funnel.applies > 0 ? ((funnel.hired / funnel.applies) * 100).toFixed(1) : "0";

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Nav */}
        <Link href="/jobs/dashboard" className="text-xs text-dim transition-colors hover:text-muted">
          &larr; Back to Dashboard
        </Link>

        <h1 className="mt-4 text-xl text-cream sm:text-2xl">Performance & Candidates</h1>

        {/* ─── Funnel ─── */}
        <div className="mt-6">
          <p className="text-xs text-dim mb-3">Hiring funnel</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FunnelCard value={funnel.views} label="Views" color="#8c8c9c" />
            <FunnelCard value={funnel.applies} label="Applied" color="#c8e64a" rate={`${viewToApply}%`} rateLabel="of views" />
            <FunnelCard value={perf?.applicantsWithProfile ?? 0} label="With Profile" color="#60a5fa" rate={funnel.applies > 0 ? `${(((perf?.applicantsWithProfile ?? 0) / funnel.applies) * 100).toFixed(0)}%` : "0%"} rateLabel="of applies" />
            <FunnelCard value={funnel.hired} label="Hired" color="#4ade80" rate={`${applyToHired}%`} rateLabel="of applies" />
          </div>
        </div>

        {/* ─── Sparkline ─── */}
        {perf?.daily && perf.daily.length > 0 && (
          <div className="mt-6 border-[3px] border-border bg-bg-raised p-5">
            <p className="text-xs text-dim mb-3">Last 30 days</p>
            <div className="flex items-end gap-[2px] h-16">
              {perf.daily.map((d) => {
                const maxVal = Math.max(...perf.daily.map((p) => p.views + p.applies), 1);
                const viewH = (d.views / maxVal) * 100;
                const applyH = (d.applies / maxVal) * 100;
                return (
                  <div key={d.date} className="flex-1 flex flex-col justify-end gap-[1px]" title={`${d.date}: ${d.views} views, ${d.applies} applies`}>
                    <div className="bg-[#8c8c9c]/40 min-h-[1px]" style={{ height: `${viewH}%` }} />
                    <div className="bg-lime/60 min-h-[1px]" style={{ height: `${applyH}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-dim">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-[#8c8c9c]/40" /> Views</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-lime/60" /> Applies</span>
            </div>
          </div>
        )}

        {/* ─── Breakdowns ─── */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Top Skills */}
          {perf?.topSkills && perf.topSkills.length > 0 && (
            <div className="border-[3px] border-border bg-bg-raised p-5">
              <p className="text-xs text-dim mb-3">Top skills in applicants</p>
              <div className="space-y-1.5">
                {perf.topSkills.map((s) => {
                  const maxCount = perf.topSkills[0]?.count ?? 1;
                  return (
                    <div key={s.skill} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-20 truncate normal-case">{s.skill}</span>
                      <div className="flex-1 h-3 bg-border/30">
                        <div className="h-full bg-lime/30" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-xs text-dim w-6 text-right">{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seniority */}
          {perf?.seniorityBreakdown && Object.keys(perf.seniorityBreakdown).length > 0 && (
            <div className="border-[3px] border-border bg-bg-raised p-5">
              <p className="text-xs text-dim mb-3">Seniority distribution</p>
              <div className="space-y-1.5">
                {Object.entries(perf.seniorityBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([level, count]) => {
                    const maxCount = Math.max(...Object.values(perf.seniorityBreakdown));
                    return (
                      <div key={level} className="flex items-center gap-2">
                        <span className="text-xs text-muted w-20 truncate">{SENIORITY_LABELS[level] ?? level}</span>
                        <div className="flex-1 h-3 bg-border/30">
                          <div className="h-full bg-[#a78bfa]/30" style={{ width: `${(count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs text-dim w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Candidates header ─── */}
        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-sm text-cream">
            Candidates ({candidates?.candidates.length ?? 0})
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="cursor-pointer border-[2px] border-border bg-bg px-3 py-1.5 text-xs text-muted outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleExport}
              className="cursor-pointer border-[2px] border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-lime/30 hover:text-lime"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* ─── Candidates list ─── */}
        <div className="mt-4 space-y-2">
          {(!candidates?.candidates || candidates.candidates.length === 0) ? (
            <div className="border-[3px] border-border bg-bg-raised p-10 text-center">
              <p className="text-xs text-muted">No applications yet.</p>
            </div>
          ) : (
            candidates.candidates.map((c) => (
              <CandidateCard
                key={c.developer_id}
                candidate={c}
                updating={updating === c.developer_id}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>

        <div className="h-12" />
      </div>
    </main>
  );
}

/* ─── Funnel Card ─── */

function FunnelCard({ value, label, color, rate, rateLabel }: {
  value: number; label: string; color: string; rate?: string; rateLabel?: string;
}) {
  return (
    <div className="border-[3px] border-border bg-bg-raised p-4">
      <p className="text-2xl" style={{ color }}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
      {rate && (
        <p className="mt-0.5 text-xs text-dim normal-case">{rate} {rateLabel}</p>
      )}
    </div>
  );
}

/* ─── Candidate Card ─── */

function CandidateCard({ candidate: c, updating, onStatusChange }: {
  candidate: CandidateWithScore;
  updating: boolean;
  onStatusChange: (devId: number, status: "applied" | "hired") => void;
}) {
  const isHired = c.status === "hired";

  return (
    <div className={`border-[3px] bg-bg-raised p-4 sm:p-5 ${isHired ? "border-[#4ade80]/30" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left: dev info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/hire/${c.github_login}`}
              target="_blank"
              className="text-sm text-cream transition-colors hover:text-lime truncate"
            >
              {c.github_login}
            </Link>
            {isHired && (
              <span className="shrink-0 border-[2px] border-[#4ade80]/40 px-2 py-0.5 text-xs text-[#4ade80]">
                Hired
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-dim normal-case">
            <span>{c.contributions.toLocaleString()} contributions</span>
            <span>{c.stars} stars</span>
            <span>{c.streak}d streak</span>
            <span>Lv.{c.level}</span>
            {c.profile && <span className="text-muted">{SENIORITY_LABELS[c.profile.seniority] ?? c.profile.seniority}</span>}
            {c.skill_match > 0 && (
              <span className="text-lime">{c.skill_match}/{c.skill_total} skills match</span>
            )}
          </div>

          {/* Badges */}
          {c.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {c.badges.map((badge) => {
                const info = BADGE_INFO[badge as CandidateBadge];
                return (
                  <span
                    key={badge}
                    className="border-[2px] px-2 py-0.5 text-xs normal-case"
                    style={{ borderColor: `${info.color}40`, color: info.color }}
                  >
                    {info.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="shrink-0 flex items-center gap-2">
          <Link
            href={`/hire/${c.github_login}`}
            target="_blank"
            className="cursor-pointer border-[2px] border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
          >
            Profile
          </Link>
          {isHired ? (
            <button
              onClick={() => onStatusChange(c.developer_id, "applied")}
              disabled={updating}
              className="cursor-pointer border-[2px] border-[#4ade80]/30 px-3 py-1.5 text-xs text-[#4ade80] transition-colors hover:border-[#4ade80]/50 disabled:opacity-50"
            >
              {updating ? "..." : "Undo Hire"}
            </button>
          ) : (
            <button
              onClick={() => onStatusChange(c.developer_id, "hired")}
              disabled={updating}
              className="cursor-pointer border-[2px] border-lime/30 px-3 py-1.5 text-xs text-lime transition-colors hover:border-lime/50 hover:bg-lime/5 disabled:opacity-50"
            >
              {updating ? "..." : "Mark Hired"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
