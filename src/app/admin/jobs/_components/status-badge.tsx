import type { JobStatus } from "@/lib/jobs/types";

const styles: Record<JobStatus, string> = {
  pending_review: "bg-yellow-900/20 text-yellow-400 border-yellow-600/30",
  active: "bg-lime/15 text-lime border-lime/30",
  expired: "bg-[#8c8c9c]/15 text-[#8c8c9c] border-[#8c8c9c]/30",
  filled: "bg-lime/15 text-[#c8e64a] border-[#c8e64a]/30",
  rejected: "bg-red-900/20 text-red-400 border-red-800/30",
  draft: "bg-[#8c8c9c]/15 text-[#8c8c9c] border-[#8c8c9c]/30",
  paused: "bg-yellow-900/20 text-yellow-400 border-yellow-600/30",
};

const labels: Record<JobStatus, string> = {
  pending_review: "PENDING",
  active: "ACTIVE",
  expired: "EXPIRED",
  filled: "FILLED",
  rejected: "REJECTED",
  draft: "DRAFT",
  paused: "PAUSED",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 text-[10px] ${styles[status] ?? "text-muted border-border"}`}
    >
      {labels[status] ?? status.toUpperCase()}
    </span>
  );
}
