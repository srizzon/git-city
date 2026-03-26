import type { ComponentType } from "react";
import AceleraDevBuilding from "./buildings/AceleraDevBuilding";
import AbacatePayBuilding from "./buildings/AbacatePayBuilding";
import ViralDayBuilding from "./buildings/ViralDayBuilding";

// ─── Grid constants (must match github.ts) ──────────────────
const BLOCK_FOOTPRINT_X = 161; // 4*38 + 3*3
const BLOCK_FOOTPRINT_Z = 137; // 4*32 + 3*3
const STREET_W = 12;

/** Convert grid coordinates to world position. */
export function gridToWorldPos(
  gridX: number,
  gridZ: number,
): [number, number, number] {
  const x = gridX * (BLOCK_FOOTPRINT_X + STREET_W);
  const z = gridZ * (BLOCK_FOOTPRINT_Z + STREET_W);
  return [x, 0, z];
}

// ─── Types ──────────────────────────────────────────────────

export interface SponsorBuildingProps {
  themeAccent: string;
  themeWindowLit: string[];
  themeFace: string;
}

export interface SponsorConfig {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  accent: string;
  gridX: number;
  gridZ: number;
  features: string[];
  /** Visual 3D building component — receives theme props only. */
  Building: ComponentType<SponsorBuildingProps>;
  /** Invisible cylinder hitbox radius. */
  hitboxRadius: number;
  /** Invisible cylinder hitbox height. */
  hitboxHeight: number;
  /** SVG element for the card logo (24×24 viewBox). */
  logoSvg?: React.ReactNode;
}

// ─── Registry ───────────────────────────────────────────────

export const SPONSORS: SponsorConfig[] = [
  {
    slug: "aceleradev",
    name: "Acelera Dev",
    tagline: "Conquiste sua vaga em tech",
    description:
      "Método que já levou devs comuns a oportunidades extraordinárias. Currículo, LinkedIn, entrevistas e posicionamento estratégico para conquistar sua primeira (ou melhor) vaga em tech.",
    url: "https://aceleradev.com.br/",
    accent: "#38bdf8",
    gridX: -1,
    gridZ: 1,
    features: ["Currículo otimizado", "LinkedIn estratégico", "Preparação para entrevistas"],
    Building: AceleraDevBuilding,
    hitboxRadius: 70,
    hitboxHeight: 500,
    logoSvg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    slug: "abacatepay",
    name: "AbacatePay",
    tagline: "Infraestrutura de pagamentos para SaaS",
    description:
      "Receba fácil. Cresça rápido. Pagamentos via Pix, cartão e boleto em poucas linhas de código. Feito para devs, vibe-coders e AI Agents.",
    url: "https://www.abacatepay.com/",
    accent: "#22c55e",
    gridX: -1,
    gridZ: -1,
    features: ["Pix, Cartão e Boleto", "Checkout integrado", "15+ SDKs"],
    Building: AbacatePayBuilding,
    hitboxRadius: 95,
    hitboxHeight: 550,
    logoSvg: (
      <svg width="24" height="24" viewBox="6 7 28 30" fill="none">
        <path d="M30.666 19.469C29.371 20.766 28.572 22.483 28.41 24.298C28.206 26.721 27.153 28.995 25.431 30.714C23.492 31.654 22.15 32.908 20.05 33.679C17.95 33.679 15.637 33.417 14.41 32.908C13.183 32.4 12.068 31.654 11.129 30.714C10.19 29.774 9.445 28.659 8.937 27.431C8.428 26.203 8.167 24.887 8.167 23.558C8.167 22.229 8.428 20.913 8.937 19.685C9.445 18.457 10.19 17.341 11.129 16.402C12.847 14.681 15.119 13.625 17.541 13.42C19.368 13.267 21.081 12.471 22.377 11.174L22.581 10.968C23.126 10.424 23.772 9.991 24.483 9.697C25.194 9.402 25.956 9.25 26.726 9.25C27.496 9.25 28.258 9.402 28.969 9.697C29.681 9.991 30.327 10.424 30.871 10.968C31.415 11.513 31.847 12.16 32.142 12.871C32.436 13.583 32.588 14.346 32.588 15.116C32.588 15.887 32.436 16.649 32.142 17.361C31.847 18.073 31.415 18.719 30.871 19.264L30.666 19.469Z" fill="currentColor"/>
        <circle cx="18.76" cy="23.14" r="4.7" fill="#804B35"/>
      </svg>
    ),
  },
  {
    slug: "viralday",
    name: "Viral Day",
    tagline: "Turn videos into viral clips with AI",
    description:
      "Transform long-form videos into viral-ready clips. AI analyzes 18 parameters to find the best moments. TikTok, Reels, Shorts in minutes.",
    url: "https://viral.day/en",
    accent: "#8F58FF",
    gridX: 1,
    gridZ: 1,
    features: ["AI-powered clips", "Auto-captions", "TikTok, Reels & Shorts"],
    Building: ViralDayBuilding,
    hitboxRadius: 70,
    hitboxHeight: 550,
    logoSvg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <polygon points="3,3 3,21 17,12" fill="currentColor" />
        <circle cx="19" cy="7" r="1.2" fill="currentColor" opacity="0.9" />
        <circle cx="21" cy="10" r="1" fill="currentColor" opacity="0.7" />
        <circle cx="20" cy="13.5" r="0.8" fill="currentColor" opacity="0.5" />
        <circle cx="19" cy="16.5" r="0.6" fill="currentColor" opacity="0.35" />
      </svg>
    ),
  },
];
