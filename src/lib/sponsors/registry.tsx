import type { ComponentType } from "react";
import ArkiBuilding from "./buildings/ArkiBuilding";
import GuaraCloudBuilding from "./buildings/GuaraCloudBuilding";
import SolanaHackathonBuilding from "./buildings/SolanaHackathonBuilding";

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
    slug: "arki",
    name: "Arki",
    tagline: "Lance seu SaaS essa semana",
    description:
      "Starter kit production-ready para SaaS. Auth, pagamentos, multi-tenancy e 40+ temas prontos. Pule a parte chata e lance rápido.",
    url: "https://www.usearki.dev/",
    accent: "#f97316",
    gridX: -1,
    gridZ: 1,
    features: ["Auth completa", "Stripe + PIX integrados", "Multi-tenancy"],
    Building: ArkiBuilding,
    hitboxRadius: 80,
    hitboxHeight: 450,
    logoSvg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C12 2 15.5 6 15.5 12C15.5 15.5 13.8 18 12 19.5C10.2 18 8.5 15.5 8.5 12C8.5 6 12 2 12 2Z" fill="currentColor" />
        <path d="M8.5 13L6 16L8.5 14.5V13Z" fill="currentColor" />
        <path d="M15.5 13L18 16L15.5 14.5V13Z" fill="currentColor" />
        <path d="M10.5 19.5L10 22H12H14L13.5 19.5" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    slug: "guaracloud",
    name: "Guara Cloud",
    tagline: "Deploy in seconds",
    description:
      "Brazilian cloud for developers. Git-based auto deploys, free HTTPS, real-time metrics, autoscaling, and billing in BRL. LGPD-compliant out of the box.",
    url: "https://guaracloud.com",
    accent: "#8b5cf6",
    gridX: 1,
    gridZ: 1,
    features: ["Git-based deploys", "Autoscaling", "Billing in BRL"],
    Building: GuaraCloudBuilding,
    hitboxRadius: 80,
    hitboxHeight: 450,
    logoSvg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M6 16a4 4 0 0 1-.5-7.97A6 6 0 0 1 17.5 8.5a4.5 4.5 0 0 1 .5 8.97H6Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    slug: "solana-hackathon",
    name: "Colosseum Hackathon",
    tagline: "Superteam Brasil x Solana",
    description:
      "Colosseum Global Hackathon 2026. Build on Solana, compete globally, win R$5M+ in prizes and seed capital. Brazilian teams already won $300K last edition.",
    url: "https://colosseum.com/frontier?ref=brasil",
    accent: "#9945FF",
    gridX: -1,
    gridZ: -1,
    features: ["R$5M+ in prizes", "$300K seed per team", "80K+ global builders"],
    Building: SolanaHackathonBuilding,
    hitboxRadius: 80,
    hitboxHeight: 500,
    logoSvg: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 7h16l-2 2H6L4 7Z" fill="currentColor" />
        <path d="M4 17h16l-2-2H6l-2 2Z" fill="currentColor" />
        <path d="M20 12H4l2-2h12l2 2Z" fill="currentColor" />
      </svg>
    ),
  },
];
