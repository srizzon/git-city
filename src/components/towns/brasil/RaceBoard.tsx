"use client";

import { useEffect, useState } from "react";
import { formatLap } from "@/lib/league-city/race/laps";
import type { RacerWeekRow, RouteRecord } from "@/lib/towns/brasil-race-server";
import { useT } from "@/lib/i18n/LangProvider";

// The Brasil map's races in the States board: this week's racers (race
// points, wins, records held) and every route's record, by city name.
// Empty: how to start one.

export default function RaceBoard({ slug, cityName, you, onRace }: { slug: string; cityName: (key: string) => string; you: string | null; onRace: () => void }) {
  const t = useT();
  const [data, setData] = useState<{ racers: RacerWeekRow[]; records: RouteRecord[] } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/towns/${encodeURIComponent(slug)}/brasil/race?view=week`)
      .then((r) => r.json())
      .then((b: { racers?: RacerWeekRow[]; records?: RouteRecord[] }) => live && setData({ racers: b.racers ?? [], records: b.records ?? [] }))
      .catch(() => live && setData({ racers: [], records: [] }));
    return () => {
      live = false;
    };
  }, [slug]);

  const me = you?.toLowerCase() ?? null;
  const race = (
    <button type="button" onClick={onRace} className="btn-press min-h-10 w-full bg-lime text-[10px] text-bg">
      {t("Drive and race", "Dirigir e correr")}
    </button>
  );
  if (!data) return <p className="px-1 py-6 text-center text-[9px] text-muted">{t("Loading races…", "Carregando corridas…")}</p>;
  if (!data.racers.length && !data.records.length) {
    return (
      <div className="flex flex-col gap-3 px-1 py-4 text-[9px] normal-case text-muted">
        <p>{t("No races this week yet. Drive, press Race, and everyone driving gets 15 s to join. Finishing scores points for your state.", "Nenhuma corrida essa semana ainda. Dirige, aperta Corrida e quem tá dirigindo tem 15 s pra entrar. Terminar dá pontos pro teu estado.")}</p>
        {race}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="text-left text-[8px] text-dim">
            <th className="py-1 pl-1 font-normal">#</th>
            <th className="py-1 font-normal">{t("Racer", "Piloto")}</th>
            <th className="py-1 text-right font-normal">{t("Wins", "Vitórias")}</th>
            <th className="py-1 text-right font-normal">{t("Records", "Recordes")}</th>
            <th className="py-1 pr-1 text-right font-normal">Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.racers.map((r, i) => (
            <tr key={r.login} className={`border-t-2 border-border ${r.login.toLowerCase() === me ? "text-lime" : "text-cream"}`}>
              <td className="py-2 pl-1 tabular-nums text-muted">{i + 1}</td>
              <td className="max-w-[140px] truncate py-2 normal-case">@{r.login}</td>
              <td className="py-2 text-right tabular-nums">{r.wins}</td>
              <td className="py-2 text-right tabular-nums">{r.records}</td>
              <td className="py-2 pr-1 text-right tabular-nums text-lime">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.records.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="px-1 text-[9px] text-muted">{t("Route records", "Recordes das rotas")}</p>
          <ul className="flex flex-col gap-1">
            {[...data.records]
              .sort((a, b) => cityName(a.from).localeCompare(cityName(b.from)) || cityName(a.to).localeCompare(cityName(b.to)))
              .slice(0, 40)
              .map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 border-2 border-border px-3 py-2 text-[9px]">
                  <span className="min-w-0 truncate text-cream">
                    {cityName(r.from)} → {cityName(r.to)}
                  </span>
                  <span className={`shrink-0 normal-case ${r.login.toLowerCase() === me ? "text-lime" : "text-muted"}`}>
                    @{r.login} · <span className="tabular-nums">{formatLap(r.ms)}</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
      {race}
    </div>
  );
}
