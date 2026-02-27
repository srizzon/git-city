import type { SortKey, SortDir } from "../_lib/types";

interface SortButtonProps {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}

export function SortButton({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: SortButtonProps) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer text-left text-[11px] transition-colors ${
        isActive ? "text-lime" : "text-muted hover:text-cream"
      }`}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-[9px]">
          {currentDir === "asc" ? "\u25B2" : "\u25BC"}
        </span>
      )}
    </button>
  );
}
