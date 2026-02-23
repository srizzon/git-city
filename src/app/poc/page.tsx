"use client";

import dynamic from "next/dynamic";

const CityPOC = dynamic(() => import("@/components/CityPOC"), { ssr: false });

export default function POCPage() {
  return <CityPOC />;
}
