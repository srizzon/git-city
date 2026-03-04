export type ItemStatus = "done" | "building" | "planned";

export interface RoadmapItem {
  id: string;
  name: string;
  description?: string;
  status: ItemStatus;
  mystery?: boolean; // hides vote button, shows "???" vibe
}

export interface RoadmapPhase {
  id: string;
  title: string;
  quarter: string;
  status: ItemStatus;
  items: RoadmapItem[];
}

export const ROADMAP_PHASES: RoadmapPhase[] = [
  {
    id: "foundation",
    title: "FOUNDATION",
    quarter: "Q1 2026",
    status: "done",
    items: [
      {
        id: "3d-city-canvas",
        name: "3D City Canvas",
        description: "Interactive Three.js city built from real GitHub data",
        status: "done",
      },
      {
        id: "github-oauth",
        name: "GitHub OAuth & Dev Profiles",
        description: "Sign in with GitHub, personalized developer pages",
        status: "done",
      },
      {
        id: "leaderboard",
        name: "Leaderboard & Compare",
        description: "Rankings by contributions, stars, repos + head-to-head comparison",
        status: "done",
      },
      {
        id: "cosmetic-shop",
        name: "Cosmetic Shop",
        description: "Customize your building with crowns, auras, faces & more",
        status: "done",
      },
      {
        id: "ad-platform",
        name: "Ad Platform",
        description: "Self-service billboard ads inside the city",
        status: "done",
      },
      {
        id: "raid-system",
        name: "Battle System",
        description: "Visit and battle other developers' buildings",
        status: "done",
      },
      {
        id: "city-flyover",
        name: "City Intro Flyover",
        description: "Cinematic camera flyover on first visit",
        status: "done",
      },
      {
        id: "districts",
        name: "Districts",
        description: "10 specialized neighborhoods: Frontend, Backend, DevOps, and more",
        status: "done",
      },
    ],
  },
  {
    id: "the-game",
    title: "THE GAME",
    quarter: "Q2 2026",
    status: "building",
    items: [
      {
        id: "street-mode",
        name: "Street Mode",
        description: "Walk around the city in third person with WASD controls",
        status: "building",
      },
      {
        id: "dailies",
        name: "Standup / Dailies",
        description: "Quick daily activities: Push, Code Review, Bug Hunt, Deploy",
        status: "done",
      },
      {
        id: "xp-leveling",
        name: "XP & Leveling",
        description: "Earn XP from coding and exploring. Rank up from Intern to Founder",
        status: "planned",
      },
      {
        id: "pixels-currency",
        name: "Pixels (PX) Currency",
        description: "Virtual currency earned through gameplay, spent on cosmetics & vehicles",
        status: "planned",
      },
      {
        id: "git-log",
        name: "Git Log / Passport",
        description: "Collect stamps by visiting buildings. Complete districts for badges",
        status: "planned",
      },
      {
        id: "onboarding",
        name: "Onboarding Tutorial",
        description: "Guided first 90 seconds: fly, explore, visit, learn the loop",
        status: "building",
      },
    ],
  },
  {
    id: "the-mystery",
    title: "THE MYSTERY",
    quarter: "Q3 2026",
    status: "planned",
    items: [
      {
        id: "vehicles",
        name: "Vehicles",
        description: "Unlock faster ways to travel as you level up",
        status: "planned",
      },
      {
        id: "mystery-1",
        name: "???",
        description: "Something lurks beneath the city...",
        status: "planned",
        mystery: true,
      },
      {
        id: "mystery-2",
        name: "???",
        description: "Secrets are everywhere. Can you find them?",
        status: "planned",
        mystery: true,
      },
      {
        id: "mystery-3",
        name: "???",
        description: "The creator hides things for those who look",
        status: "planned",
        mystery: true,
      },
    ],
  },
  {
    id: "the-status",
    title: "THE STATUS",
    quarter: "Q4 2026",
    status: "planned",
    items: [
      {
        id: "offshore",
        name: "The Offshore",
        description: "Exclusive zone for the top 3% of active players",
        status: "planned",
      },
      {
        id: "the-process",
        name: "The Process & The Queue",
        description: "Prove yourself worthy. Then wait your turn",
        status: "planned",
      },
      {
        id: "pro-plan",
        name: "Pro Plan",
        description: "Monthly subscription with premium perks",
        status: "planned",
      },
      {
        id: "season-branch",
        name: "Season Branch",
        description: "Seasonal battle pass with exclusive quests and rewards",
        status: "planned",
      },
    ],
  },
  {
    id: "the-city-lives",
    title: "THE CITY LIVES",
    quarter: "2027",
    status: "planned",
    items: [
      {
        id: "multiplayer",
        name: "Multiplayer Lite",
        description: "See other players as ghosts roaming the city",
        status: "planned",
      },
      {
        id: "driveby-firewall",
        name: "Drive-by Battles & Firewall",
        description: "Drive to a building to battle it. Auto-shield after 3 battles/day",
        status: "planned",
      },
      {
        id: "living-city",
        name: "Living City",
        description: "NPCs, real-time commit pulses, visual decay for inactive buildings",
        status: "planned",
      },
      {
        id: "live-ops",
        name: "Live Ops & Events",
        description: "Seasonal events, tournaments, and surprises from the creator",
        status: "planned",
      },
    ],
  },
];

// All valid item IDs (for server-side vote validation)
export const VALID_ITEM_IDS = new Set(
  ROADMAP_PHASES.flatMap((phase) => phase.items.map((item) => item.id))
);

// Items that can be voted on (not done, not mystery)
export const VOTABLE_ITEM_IDS = new Set(
  ROADMAP_PHASES.flatMap((phase) =>
    phase.items
      .filter((item) => item.status !== "done" && !item.mystery)
      .map((item) => item.id)
  )
);
