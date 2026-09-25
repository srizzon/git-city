"use client";

// Google Maps style map controls for explore mode: a compass that shows north
// and turns the map back to it, zoom buttons, and chips that fly to each city.
import { useSyncExternalStore } from "react";
import { mapNav, MAP_PLACES } from "@/lib/map-nav";

type CameraPos = { x: number; z: number; tx: number; tz: number };

export default function MapNavControls({
  camera,
  accent,
  showPlaces,
}: {
  camera: { get: () => CameraPos; subscribe: (f: () => void) => () => void };
  accent: string;
  showPlaces: boolean;
}) {
  const cam = useSyncExternalStore(camera.subscribe, camera.get, camera.get);
  // Screen-up direction on the map; 0 when north is up.
  const heading = Math.atan2(cam.x - cam.tx, cam.z - cam.tz);
  const btn = "btn-press flex h-9 w-9 items-center justify-center border-[3px] border-border bg-bg/80 text-cream backdrop-blur-sm transition-colors hover:border-border-light";
  return (
    <>
      {showPlaces && (
        <div className="no-scrollbar pointer-events-auto fixed left-3 right-3 top-16 z-30 flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 pr-1 sm:left-1/2 sm:right-auto sm:top-4 sm:max-w-[calc(100vw-9rem)] sm:-translate-x-1/2">
          {MAP_PLACES.map((p) => (
            <button
              key={p.label}
              onClick={() => mapNav.send({ type: "flyTo", x: p.x, z: p.z, distance: 2600 })}
              className="btn-press shrink-0 border-[3px] border-border bg-bg/80 px-2.5 py-1 text-[10px] uppercase tracking-wider text-cream backdrop-blur-sm transition-colors hover:border-border-light"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="pointer-events-auto fixed bottom-[196px] right-3 z-30 flex flex-col gap-1.5 sm:bottom-[204px] sm:right-4">
        <button onClick={() => mapNav.send({ type: "north" })} className={btn} aria-label="Face north" title="Face north">
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${heading}rad)`, transition: "transform 80ms linear" }}>
            <polygon points="9,1 13,9 9,7.5 5,9" fill={accent} />
            <polygon points="9,17 13,9 9,10.5 5,9" fill="currentColor" opacity="0.45" />
          </svg>
        </button>
        {/* Phones pinch to zoom; the buttons are for mouse users (Google Maps does the same). */}
        <button onClick={() => mapNav.send({ type: "zoom", factor: 0.6 })} className={`${btn} max-sm:hidden`} aria-label="Zoom in">+</button>
        <button onClick={() => mapNav.send({ type: "zoom", factor: 1 / 0.6 })} className={`${btn} max-sm:hidden`} aria-label="Zoom out">−</button>
      </div>
    </>
  );
}
