// ─── New town quest ─────────────────────────────────────────
// The four things a new town's admin learns by doing (Minecraft's tutorial
// toasts, Roblox's checklist): each ticks itself when it happens, in any
// order. Kept per town in localStorage; started by /towns/new (?new=1).

export const QUEST_STEPS = ["drive", "build", "place", "invite"] as const;
export type QuestStep = (typeof QUEST_STEPS)[number];
export type QuestState = Record<QuestStep, boolean>;

export const QUEST_TEXT: Record<QuestStep, string> = {
  drive: "Drive around",
  build: "Open build mode",
  place: "Place a road or prop",
  invite: "Invite a dev",
};

/** Phones can't drive or build: their quest is the invite. */
export function questSteps(desktop: boolean): readonly QuestStep[] {
  return desktop ? QUEST_STEPS : ["invite"];
}

export const questKey = (slug: string) => `gc:town-quest:${slug}`;

export function freshQuest(): QuestState {
  return { drive: false, build: false, place: false, invite: false };
}

/** Stored value → state. "done" and anything unreadable mean no quest. */
export function parseQuest(raw: string | null): QuestState | null {
  if (!raw || raw === "done") return null;
  try {
    const v = JSON.parse(raw) as Partial<QuestState>;
    const out = freshQuest();
    for (const s of QUEST_STEPS) out[s] = v[s] === true;
    return out;
  } catch {
    return null;
  }
}

/** The first step not done yet, or null when the quest is complete. */
export function nextStep(state: QuestState, steps: readonly QuestStep[]): QuestStep | null {
  return steps.find((s) => !state[s]) ?? null;
}
