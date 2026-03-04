"use client";

import dynamic from "next/dynamic";

const EffectsPOC = dynamic(() => import("@/components/EffectsPOC"), {
  ssr: false,
});

export default function EffectsPOCPage() {
  return <EffectsPOC />;
}
