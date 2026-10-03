import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  xpDeltaForLevel,
  levelFromXp,
  tierFromLevel,
  rankFromLevel,
  levelProgress,
  calculateGithubXp,
  xpForAchievementTier,
  XP_TIERS,
  DAILY_XP_CAP,
} from "./xp";

describe("xpForLevel", () => {
  it("returns 0 for level 1 and level 0", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(0)).toBe(0);
  });

  it("strictly increases for levels 1..30", () => {
    for (let level = 1; level < 30; level++) {
      expect(xpForLevel(level + 1)).toBeGreaterThan(xpForLevel(level));
    }
  });
});

describe("xpDeltaForLevel", () => {
  it("equals difference between consecutive thresholds", () => {
    for (let level = 1; level <= 25; level++) {
      expect(xpDeltaForLevel(level)).toBe(xpForLevel(level + 1) - xpForLevel(level));
    }
  });

  it("is positive for levels 1..30", () => {
    for (let level = 1; level <= 30; level++) {
      expect(xpDeltaForLevel(level)).toBeGreaterThan(0);
    }
  });
});

describe("levelFromXp", () => {
  it("roundtrips exact thresholds for levels 1..25", () => {
    for (let level = 1; level <= 25; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });

  it("never goes below 1", () => {
    expect(levelFromXp(-100)).toBe(1);
    expect(levelFromXp(0)).toBe(1);
  });
});

describe("levelProgress", () => {
  it("stays within [0,1] for 0, thresholds and mid-level values", () => {
    const samples: number[] = [0];
    for (let level = 1; level <= 25; level++) {
      const current = xpForLevel(level);
      const next = xpForLevel(level + 1);
      samples.push(current);
      samples.push(Math.floor((current + next) / 2));
    }
    for (const xp of samples) {
      const progress = levelProgress(xp);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0 at exact thresholds", () => {
    for (let level = 1; level <= 25; level++) {
      expect(levelProgress(xpForLevel(level))).toBe(0);
    }
  });
});

describe("tierFromLevel", () => {
  it("maps level boundaries to the right tier", () => {
    expect(tierFromLevel(1).id).toBe("localhost");
    expect(tierFromLevel(4).id).toBe("localhost");
    expect(tierFromLevel(5).id).toBe("staging");
    expect(tierFromLevel(8).id).toBe("staging");
    expect(tierFromLevel(9).id).toBe("production");
    expect(tierFromLevel(13).id).toBe("production");
    expect(tierFromLevel(14).id).toBe("open_source");
    expect(tierFromLevel(18).id).toBe("open_source");
    expect(tierFromLevel(19).id).toBe("unicorn");
    expect(tierFromLevel(23).id).toBe("unicorn");
    expect(tierFromLevel(24).id).toBe("founder");
    expect(tierFromLevel(100).id).toBe("founder");
  });
});

describe("XP_TIERS and DAILY_XP_CAP", () => {
  it("exposes six tiers in order", () => {
    expect(XP_TIERS.map((tier) => tier.id)).toEqual([
      "localhost",
      "staging",
      "production",
      "open_source",
      "unicorn",
      "founder",
    ]);
  });

  it("caps daily XP at 150", () => {
    expect(DAILY_XP_CAP).toBe(150);
  });
});

describe("calculateGithubXp", () => {
  it("is deterministic for the same input", () => {
    const input = { contributions: 100, total_stars: 50, public_repos: 10, total_prs: 20 };
    expect(calculateGithubXp(input)).toBe(calculateGithubXp({ ...input }));
  });

  it("is monotonic in each field", () => {
    const base = { contributions: 10, total_stars: 10, public_repos: 10, total_prs: 10 };
    const baseXp = calculateGithubXp(base);
    expect(calculateGithubXp({ ...base, contributions: 1000 })).toBeGreaterThan(baseXp);
    expect(calculateGithubXp({ ...base, total_stars: 1000 })).toBeGreaterThan(baseXp);
    expect(calculateGithubXp({ ...base, public_repos: 1000 })).toBeGreaterThan(baseXp);
    expect(calculateGithubXp({ ...base, total_prs: 1000 })).toBeGreaterThan(baseXp);
  });

  it("returns a finite non-negative number for zero-ish input", () => {
    const xp = calculateGithubXp({
      contributions: 0,
      total_stars: 0,
      public_repos: 0,
      total_prs: 0,
    });
    expect(Number.isFinite(xp)).toBe(true);
    expect(xp).toBeGreaterThanOrEqual(0);
  });
});

describe("xpForAchievementTier", () => {
  it("maps known tiers to XP values", () => {
    expect(xpForAchievementTier("bronze")).toBe(10);
    expect(xpForAchievementTier("silver")).toBe(25);
    expect(xpForAchievementTier("gold")).toBe(50);
    expect(xpForAchievementTier("diamond")).toBe(100);
  });

  it("returns 0 for unknown tiers", () => {
    expect(xpForAchievementTier("unknown")).toBe(0);
    expect(xpForAchievementTier("")).toBe(0);
  });
});

describe("rankFromLevel", () => {
  it("returns expected titles", () => {
    expect(rankFromLevel(1).title).toBe("Hello World");
    expect(rankFromLevel(25).title).toBe("Legend");
    expect(rankFromLevel(30).title).toBe("Legend");
  });
});
