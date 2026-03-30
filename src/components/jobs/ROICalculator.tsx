"use client";

const COMPARE_ROWS = [
  { label: "Developer profiles", others: "Self-reported resumes", gitcity: "GitHub-verified data" },
  { label: "Skills verification", others: "Trust the resume", gitcity: "Real contributions & repos" },
  { label: "Candidate quality", others: "250+ unqualified per job", gitcity: "Pre-qualified developers" },
  { label: "Activity proof", others: "None", gitcity: "Streaks, XP, commit history" },
  { label: "Salary on listing", others: "Optional or hidden", gitcity: "Required on every job" },
  { label: "Avg. qualified rate", others: "2-3%", gitcity: "High (community self-selects)" },
];

export default function ROICalculator() {
  return (
    <div className="border-[3px] border-border overflow-hidden">
      <div className="grid grid-cols-3 border-b-[3px] border-border bg-bg-raised">
        <div className="p-3 sm:p-4" />
        <div className="p-3 sm:p-4 text-center border-l-[3px] border-border">
          <p className="text-xs text-muted">Others</p>
        </div>
        <div className="p-3 sm:p-4 text-center border-l-[3px] border-border bg-lime/[0.03]">
          <p className="text-xs text-lime">Git City</p>
        </div>
      </div>
      {COMPARE_ROWS.map((row, i) => (
        <div key={row.label} className={`grid grid-cols-3 ${i < COMPARE_ROWS.length - 1 ? "border-b-[3px] border-border" : ""}`}>
          <div className="p-3 sm:p-4"><p className="text-xs text-cream">{row.label}</p></div>
          <div className="p-3 sm:p-4 border-l-[3px] border-border"><p className="text-xs text-red-400/50 normal-case">{row.others}</p></div>
          <div className="p-3 sm:p-4 border-l-[3px] border-border bg-lime/[0.02]"><p className="text-xs text-lime/80 normal-case">{row.gitcity}</p></div>
        </div>
      ))}
    </div>
  );
}
