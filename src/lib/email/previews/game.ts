import { renderRaidEmail } from "../../notification-senders/raid";
import { renderWeeklyRecapEmail, type WeeklyRecapData } from "../../notification-senders/weekly-recap";
import { renderWelcomeEmail } from "../../notification-senders/welcome";
import { PREVIEW_LINKS, type EmailPreviews } from "./types";

const RECAP: WeeklyRecapData = {
  login: "srizzon",
  weekKey: "2026-09-21",
  xpTotal: 8688,
  xpThisWeek: 340,
  streak: 12,
  rank: 7576,
  visitors: 14,
  kudos: 3,
  raidsAgainst: 2,
  raidsDefended: 1,
  raidWins: 1,
  emblems: ["Night Owl", "Raider", "Streak 7"],
  activeTagBy: "pyromains",
  townOfWeek: { name: "Ship City", slug: "ship-city" },
  newDevelopers: 93,
};

// Sample renders for the admin preview (?template=<key>) and test sends.
export const GAME_PREVIEWS: EmailPreviews = {
  "welcome-sample": () => renderWelcomeEmail("srizzon", 7576, PREVIEW_LINKS),
  "raid-tagged": () =>
    renderRaidEmail(
      { defenderLogin: "kristoferborges", attackerLogin: "pyromains", raidId: "a878a3cc-379c-4528-91ad-11612fa5b797", success: true, attackScore: 22, defenseScore: 4 },
      PREVIEW_LINKS,
    ),
  "raid-defended": () =>
    renderRaidEmail(
      { defenderLogin: "mrousavy", attackerLogin: "zappymanwho", raidId: "2492c59b-154e-496b-99a6-4689d2291282", success: false, attackScore: 0, defenseScore: 134 },
      PREVIEW_LINKS,
    ),
  "recap-busy": () => renderWeeklyRecapEmail(RECAP, PREVIEW_LINKS),
  "recap-quiet": () =>
    renderWeeklyRecapEmail(
      { ...RECAP, xpThisWeek: 45, streak: 3, visitors: 0, kudos: 0, raidsAgainst: 0, raidsDefended: 0, raidWins: 0, emblems: [], activeTagBy: null },
      PREVIEW_LINKS,
    ),
};
