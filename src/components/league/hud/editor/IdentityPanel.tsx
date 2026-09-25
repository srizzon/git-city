"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ALT_MAX, ALT_MIN, MESSAGE_MAX, ORBIT_MAX, ORBIT_MIN, SKY_BG_COLORS, SKY_TEXT_COLORS, messageProblem } from "@/lib/league-city/props-schema";
import { NEEDS_LOGO_TEXT } from "@/lib/league-city/editor/state";
import type { CityObject, ObjectProps, SignSide } from "@/lib/league-city/types";
import { HUD_BOX } from "../shared";

// Settings for the identity piece in hand or just placed: a plane's or
// blimp's message and colors, a plaza's floor logo, the hill sign's side.

const LABEL = "text-[9px] text-muted";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={`${HUD_BOX} pointer-events-auto fixed right-4 top-20 z-40 w-[272px] max-w-[calc(100vw-32px)] p-3 font-pixel uppercase`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] text-cream">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-cream">
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Swatches({ colors, value, onPick, label }: { colors: readonly string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onPick(c)}
          className={`h-6 w-6 border-2 ${value === c ? "border-lime" : "border-border"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/** Plane or blimp: message, colors, altitude (and orbit for planes). */
export function SkyPanel({ object, onChange, onClose }: { object: CityObject; onChange: (props: ObjectProps) => void; onClose: () => void }) {
  const props = object.props ?? {};
  const plane = object.item_type === "plane";
  // Keyed by the saved text upstream, so undo resets the field.
  const [text, setText] = useState(String(props.text ?? ""));
  const problem = messageProblem(text);
  const set = (patch: ObjectProps) => onChange({ ...props, ...patch });
  const commitText = () => {
    if (!problem && text.trim() !== props.text) set({ text: text.trim() });
  };

  return (
    <Shell title={plane ? "Plane" : "Blimp"} onClose={onClose}>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Message</span>
        <input
          value={text}
          maxLength={MESSAGE_MAX + 20}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitText();
          }}
          className="border-2 border-border bg-bg px-2 py-1.5 text-[16px] normal-case text-cream outline-none focus:border-lime sm:text-[11px]"
        />
        <span className={`text-[9px] normal-case ${problem ? "text-red-400" : "text-dim"}`}>
          {problem ?? `${text.trim().length}/${MESSAGE_MAX}`}
        </span>
      </label>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Text</span>
        <Swatches colors={SKY_TEXT_COLORS} value={String(props.color)} onPick={(color) => set({ color })} label="Text color" />
      </div>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Background</span>
        <Swatches colors={SKY_BG_COLORS} value={String(props.bg)} onPick={(bg) => set({ bg })} label="Background color" />
      </div>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Altitude</span>
        <input type="range" min={ALT_MIN} max={ALT_MAX} step={10} defaultValue={Number(props.alt)} onPointerUp={(e) => set({ alt: Number(e.currentTarget.value) })} onKeyUp={(e) => set({ alt: Number(e.currentTarget.value) })} className="accent-lime" />
      </label>
      {plane && (
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Circle size</span>
          <input type="range" min={ORBIT_MIN} max={ORBIT_MAX} step={20} defaultValue={Number(props.orbit)} onPointerUp={(e) => set({ orbit: Number(e.currentTarget.value) })} onKeyUp={(e) => set({ orbit: Number(e.currentTarget.value) })} className="accent-lime" />
        </label>
      )}
      <p className="text-[9px] normal-case text-dim">{plane ? "It circles where you placed it." : "It hovers where you placed it."} No links.</p>
    </Shell>
  );
}

/** Plaza: the town logo laid into the paving. */
export function PlazaPanel({ object, hasLogo, onChange, onClose }: { object: CityObject; hasLogo: boolean; onChange: (props: ObjectProps) => void; onClose: () => void }) {
  const on = object.props?.logo_floor === true;
  return (
    <Shell title="Plaza" onClose={onClose}>
      <button
        type="button"
        aria-pressed={on}
        disabled={!hasLogo}
        onClick={() => onChange({ logo_floor: !on })}
        className={`btn-press border-2 px-3 py-2 text-[10px] ${on ? "border-lime text-lime" : "border-border text-cream"} disabled:opacity-40`}
      >
        Logo on floor: {on ? "on" : "off"}
      </button>
      {!hasLogo && <p className="text-[9px] normal-case text-dim">{NEEDS_LOGO_TEXT}</p>}
    </Shell>
  );
}

const SIDES: { id: SignSide | null; label: string }[] = [
  { id: "north", label: "North" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
  { id: null, label: "None" },
];

/** Hill sign: which hill outside the city carries the town name. */
export function HillSignPanel({ side, saving, error, onPick, onClose }: { side: SignSide | null; saving: boolean; error: string | null; onPick: (s: SignSide | null) => void; onClose: () => void }) {
  return (
    <Shell title="Hill sign" onClose={onClose}>
      <p className="text-[9px] normal-case text-dim">The town name in giant letters on a hill. It moves out as the city grows.</p>
      <div role="radiogroup" aria-label="Side" className="grid grid-cols-4 gap-1.5">
        {SIDES.map((s) => (
          <button
            key={s.label}
            type="button"
            role="radio"
            aria-checked={side === s.id}
            disabled={saving}
            onClick={() => onPick(s.id)}
            className={`border-2 px-1 py-1.5 text-[9px] ${side === s.id ? "border-lime text-lime" : "border-border text-cream"} disabled:opacity-50`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="text-[9px] normal-case text-red-400">{error}</p>}
    </Shell>
  );
}
