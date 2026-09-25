"use client";

import Link from "next/link";
import { useDesktop } from "@/components/towns/useDesktop";

/** 🚗 Drive on the hero: desktop only, like the town page's car. */
export default function HeroDrive({ slug }: { slug: string }) {
  const desktop = useDesktop();
  if (!desktop) return null;
  return (
    <Link
      href={`/town/${slug}?drive=1`}
      className="btn-press border-[3px] border-lime bg-bg/70 px-6 py-2.5 text-sm tracking-widest text-lime"
    >
      🚗 Drive
    </Link>
  );
}
