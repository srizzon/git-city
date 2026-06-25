import { FIRECRAWL_FLAME_BM, FIRECRAWL_FLAME_CORE_BM } from "./firecrawl-flame";
import { HEART_BM, HEART_CORE_BM } from "./sponsor-heart";

export interface FacadeBitmap {
  name: string;
  bitmap: number[][];
  /** Optional core overlay for two-tone facades (e.g. yellow hot center). */
  coreBitmap?: number[][];
  /** Use this color for the core overlay instead of the accent. */
  coreColor?: string;
}

export const FACADE_BITMAPS: Record<string, FacadeBitmap> = {
  "firecrawl-flame": {
    name: "Firecrawl flame",
    bitmap: FIRECRAWL_FLAME_BM,
    coreBitmap: FIRECRAWL_FLAME_CORE_BM,
    coreColor: "#ffe27a",
  },
  "sponsor-heart": {
    name: "Sponsor heart",
    bitmap: HEART_BM,
    coreBitmap: HEART_CORE_BM,
    coreColor: "#fff3c4",
  },
};

export const FACADE_BITMAP_NAMES: string[] = Object.keys(FACADE_BITMAPS);
