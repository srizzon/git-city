"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import { BannerPlane, Blimp } from "@/components/SkyAds";
import type { SkyAd } from "@/lib/skyAds";
import { terrainBounds, worldBounds } from "@/lib/league-city/grid";
import type { CityIdentity, CityObject, SignSide } from "@/lib/league-city/types";
import { Billboard, Flag, FloorLogo, HillSign, Portal } from "./IdentityPieces";
import { beamTexture, clothTexture, hillLettersTexture, loadLogoImage, logoTexture, wideTexture, type LogoImage } from "./logoTexture";

// Everything that makes a town recognizable: the portal, billboards, flags,
// floor logos, planes, blimps and the hill sign. One set of textures per
// city, built from the league logo and name; without a logo (none yet, or
// taken down) pieces show the name on a plate and floor logos hide.

const BLIMP_DRIFT = 14;

/** Where the hill sign's foot sits and which way its letters face (toward the city). */
export function hillSignSpot(h: number, side: SignSide): { at: [number, number]; facing: number } {
  const w = worldBounds(h);
  const t = terrainBounds(h);
  if (side === "east") return { at: [w.maxX + 20, t.cz], facing: -Math.PI / 2 };
  if (side === "west") return { at: [w.minX - 20, t.cz], facing: Math.PI / 2 };
  return { at: [0, w.minZ - 20], facing: 0 };
}

function useLogo(url: string | null): LogoImage | null {
  const [logo, setLogo] = useState<{ url: string; img: LogoImage } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    // Letters on the panels use the pixel font: wait for it before drawing.
    Promise.all([document.fonts?.load("40px Silkscreen").catch(() => null), loadLogoImage(url)])
      .then(([, img]) => live && setLogo({ url, img }))
      .catch(() => live && setLogo(null));
    return () => {
      live = false;
    };
  }, [url]);
  return url && logo?.url === url ? logo.img : null;
}

function useFontReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (document.fonts?.load("40px Silkscreen") ?? Promise.resolve())
      .catch(() => null)
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

interface Textures {
  logo: THREE.Texture | null;
  wide: THREE.Texture;
  cloth: THREE.Texture;
  beam: THREE.Texture;
  hill: { tex: THREE.Texture; aspect: number };
}

export default function IdentityLayer({
  objects,
  identity,
  name,
  h,
  hillColor,
  onPortalClick,
}: {
  objects: readonly CityObject[];
  identity: CityIdentity;
  name: string;
  h: number;
  hillColor: string;
  onPortalClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const logo = useLogo(identity.logoUrl);
  const fontReady = useFontReady();

  const tex = useMemo<Textures>(
    () => ({
      logo: logo ? logoTexture(logo) : null,
      wide: wideTexture(logo, name),
      cloth: clothTexture(logo, name),
      beam: beamTexture(logo, name),
      hill: hillLettersTexture(name),
    }),
    // fontReady: redraw once Silkscreen is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logo, name, fontReady],
  );
  useEffect(
    () => () => {
      tex.logo?.dispose();
      tex.wide.dispose();
      tex.cloth.dispose();
      tex.beam.dispose();
      tex.hill.tex.dispose();
    },
    [tex],
  );

  const pieces = useMemo(() => {
    const out = { portals: [] as CityObject[], billboards: [] as CityObject[], flags: [] as CityObject[], floors: [] as CityObject[], planes: [] as CityObject[], blimps: [] as CityObject[] };
    for (const o of objects) {
      if (o.item_type === "portal") out.portals.push(o);
      else if (o.item_type === "billboard") out.billboards.push(o);
      else if (o.item_type === "flag") out.flags.push(o);
      else if (o.item_type === "plaza" && o.props?.logo_floor === true) out.floors.push(o);
      else if (o.item_type === "plane") out.planes.push(o);
      else if (o.item_type === "blimp") out.blimps.push(o);
    }
    return out;
  }, [objects]);

  const hill = identity.signSide ? hillSignSpot(h, identity.signSide) : null;
  const sky = [...pieces.planes, ...pieces.blimps];

  return (
    <group>
      {pieces.portals.map((o) => (
        <Portal key={o.id} position={[o.px ?? 0, o.pz ?? 0]} beam={tex.beam} onClick={onPortalClick} />
      ))}
      {pieces.billboards.map((o) => (
        <Billboard key={o.id} position={[o.px ?? 0, o.pz ?? 0]} rot={o.rot} map={tex.wide} />
      ))}
      {pieces.flags.map((o, i) => (
        <Flag key={o.id} position={[o.px ?? 0, o.pz ?? 0]} rot={o.rot} map={tex.cloth} phase={i * 0.9} />
      ))}
      {tex.logo && pieces.floors.map((o) => <FloorLogo key={o.id} lot={[o.x, o.z]} map={tex.logo!} />)}
      {hill && <HillSign at={hill.at} facing={hill.facing} letters={tex.hill.tex} aspect={tex.hill.aspect} hillColor={hillColor} />}
      <Suspense fallback={null}>
        {sky.map((o, i) => {
          const p = o.props ?? {};
          const ad: SkyAd = {
            id: o.id,
            text: String(p.text ?? name),
            color: String(p.color ?? "#c8e64a"),
            bgColor: String(p.bg ?? "#0b0f19"),
            vehicle: o.item_type === "plane" ? "plane" : "blimp",
            priority: 0,
          };
          const altitude = Number(p.alt ?? 160);
          return o.item_type === "plane" ? (
            <BannerPlane key={`${o.id}:${ad.text}:${ad.color}:${ad.bgColor}`} ad={ad} index={i} total={sky.length} cityRadius={0} flyMode={false} path={{ cx: o.px ?? 0, cz: o.pz ?? 0, r: Number(p.orbit ?? 220), altitude }} />
          ) : (
            <Blimp key={`${o.id}:${ad.text}:${ad.color}:${ad.bgColor}`} ad={ad} index={i} total={sky.length} cityRadius={0} flyMode={false} path={{ cx: o.px ?? 0, cz: o.pz ?? 0, r: BLIMP_DRIFT, altitude }} />
          );
        })}
      </Suspense>
    </group>
  );
}
