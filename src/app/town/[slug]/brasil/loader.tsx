"use client";

import dynamic from "next/dynamic";
import { LangProvider, useT } from "@/lib/i18n/LangProvider";
import type { Lang } from "@/lib/i18n/lang";
import type { BrasilTownProps } from "./brasil-town";

// The Brasil town and its scene in one client bundle (one three.js), loaded in
// the browser only, in the visitor's language (Portuguese or English).
const BrasilTown = dynamic(() => import("./brasil-town"), {
  ssr: false,
  loading: () => <Loading />,
});

function Loading() {
  const t = useT();
  return <div className="fixed inset-0 flex items-center justify-center bg-bg font-pixel text-[10px] uppercase text-muted">{t("Building Brazil", "Construindo o Brasil")}</div>;
}

export default function BrasilTownLoader({ lang, ...props }: BrasilTownProps & { lang: Lang }) {
  return (
    <LangProvider initial={lang}>
      <BrasilTown {...props} />
    </LangProvider>
  );
}
