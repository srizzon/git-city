"use client";

import dynamic from "next/dynamic";
import type { ReelStudioProps } from "./reel-studio";

// The studio and the world in one client bundle (one three.js), in the browser only.
const ReelStudio = dynamic(() => import("./reel-studio"), { ssr: false, loading: () => null });

export default function ReelStudioLoader(props: ReelStudioProps) {
  return <ReelStudio {...props} />;
}
