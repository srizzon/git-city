import { MISSIONS_BY_ID, type Mission } from "../../dailies";
import { renderDigestEmail } from "../../notifications";
import { renderDailyReminderEmail } from "../../notification-senders/daily-reminder";
import { renderEmblemEmail } from "../../notification-senders/emblem";
import { renderRaidEmail } from "../../notification-senders/raid";
import { renderReEngagementEmail } from "../../notification-senders/re-engagement";
import { renderReferralJoinedEmail } from "../../notification-senders/referral";
import { renderStreakBrokenEmail } from "../../notification-senders/streak-broken";
import { renderStreakMilestoneEmail } from "../../notification-senders/streak";
import { renderWeeklyRecapEmail, type WeeklyRecapData } from "../../notification-senders/weekly-recap";
import { renderWelcomeEmail } from "../../notification-senders/welcome";
import { PREVIEW_LINKS, TRANSACTIONAL_PREVIEW_LINKS, type EmailPreviews } from "./types";

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

const missions = (...ids: string[]): Mission[] => ids.map((id) => MISSIONS_BY_ID.get(id)!);

const EMBLEM_GOLD = { id: "influencer", name: "Influencer", tier: "gold", description: "Refer 10 developers to Git City", xpReward: 100 };
const EMBLEM_DIAMOND = { id: "mayor", name: "Mayor", tier: "diamond", description: "Refer 50 developers to Git City", xpReward: 250 };

// Sample renders for the admin preview (?template=<key>) and test sends.
export const GAME_PREVIEWS: EmailPreviews = {
  "welcome-sample": () => renderWelcomeEmail("srizzon", 7576, TRANSACTIONAL_PREVIEW_LINKS),
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

  "daily-streak-freeze": () =>
    renderDailyReminderEmail(
      { kind: "streak", login: "srizzon", streak: 12, freezes: 1, missedYesterday: false, missionsLeft: missions("checkin", "give_kudos", "fly_score_50") },
      PREVIEW_LINKS,
    ),
  "daily-streak-no-freeze": () =>
    renderDailyReminderEmail(
      { kind: "streak", login: "srizzon", streak: 12, freezes: 0, missedYesterday: false, missionsLeft: missions("checkin", "visit_3_buildings") },
      PREVIEW_LINKS,
    ),
  "daily-streak-last-chance": () =>
    renderDailyReminderEmail(
      { kind: "streak", login: "srizzon", streak: 41, freezes: 1, missedYesterday: true, missionsLeft: missions("checkin", "win_battle", "visit_shop") },
      PREVIEW_LINKS,
    ),
  "daily-missions": () =>
    renderDailyReminderEmail(
      { kind: "missions", login: "srizzon", missionsDone: 1, missionsLeft: missions("give_kudos_3", "check_leaderboard") },
      PREVIEW_LINKS,
    ),
  "daily-missions-one-left": () =>
    renderDailyReminderEmail({ kind: "missions", login: "srizzon", missionsDone: 2, missionsLeft: missions("fly_score_150") }, PREVIEW_LINKS),

  "streak-milestone-30": () =>
    renderStreakMilestoneEmail({ login: "srizzon", streak: 30, longestStreak: 30, rewardItemName: "Lightning Aura" }, PREVIEW_LINKS),
  "streak-milestone-100": () => renderStreakMilestoneEmail({ login: "srizzon", streak: 100, longestStreak: 100 }, PREVIEW_LINKS),
  "streak-milestone-365-record": () => renderStreakMilestoneEmail({ login: "srizzon", streak: 365, longestStreak: 400 }, PREVIEW_LINKS),
  "streak-broken": () => renderStreakBrokenEmail({ login: "srizzon", previousStreak: 23 }, PREVIEW_LINKS),

  "emblem-single": () => renderEmblemEmail({ login: "srizzon", emblems: [EMBLEM_GOLD] }, PREVIEW_LINKS),
  "emblem-multiple": () => renderEmblemEmail({ login: "srizzon", emblems: [EMBLEM_GOLD, EMBLEM_DIAMOND] }, PREVIEW_LINKS),

  "referral-joined": () => renderReferralJoinedEmail({ referrerLogin: "srizzon", referredLogin: "pyromains" }, PREVIEW_LINKS),

  "re-engagement-7d": () => renderReEngagementEmail({ login: "srizzon", tier: "7d", kudos: 0, newDevelopers: 212 }, PREVIEW_LINKS),
  "re-engagement-7d-kudos": () => renderReEngagementEmail({ login: "srizzon", tier: "7d", kudos: 3, newDevelopers: 212 }, PREVIEW_LINKS),
  "re-engagement-14d": () => renderReEngagementEmail({ login: "srizzon", tier: "14d", kudos: 0, newDevelopers: 431 }, PREVIEW_LINKS),
  "re-engagement-30d": () => renderReEngagementEmail({ login: "srizzon", tier: "30d", kudos: 5, newDevelopers: 1204 }, PREVIEW_LINKS),

  "digest-raids": () =>
    renderDigestEmail(
      "raid_alert",
      [
        { attacker: "pyromains", success: true, attack_score: 22, defense_score: 4 },
        { attacker: "zappymanwho", success: false, attack_score: 12, defense_score: 40 },
        { attacker: "kristoferborges", success: true, attack_score: 31, defense_score: 18 },
      ],
      PREVIEW_LINKS,
    ),
  "digest-raids-held": () =>
    renderDigestEmail(
      "raid_alert",
      [
        { attacker: "pyromains", success: false, attack_score: 9, defense_score: 40 },
        { attacker: "zappymanwho", success: false, attack_score: 12, defense_score: 40 },
      ],
      PREVIEW_LINKS,
    ),
  "digest-emblems": () =>
    renderDigestEmail(
      "emblem_earned",
      [
        { action_url: "https://thegitcity.com/dev/srizzon", emblems: [{ id: "influencer", name: "Influencer", tier: "gold" }] },
        { action_url: "https://thegitcity.com/dev/srizzon", emblems: [{ id: "mayor", name: "Mayor", tier: "diamond" }] },
      ],
      PREVIEW_LINKS,
    ),
  "digest-jobs-filled": () =>
    renderDigestEmail(
      "job_filled",
      [
        { listing: "Senior Frontend Engineer", company: "Northwind" },
        { listing: "Founding Engineer", company: "Globex" },
      ],
      PREVIEW_LINKS,
    ),
};
