export interface SurveyOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  key: string;
  title: string;
  options: SurveyOption[];
}

export interface SurveyDefinition {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  questions: SurveyQuestion[];
}

// ─── All surveys ─────────────────────────────────────────────
// To create a new survey, just add it here.

export const SURVEYS: Record<string, SurveyDefinition> = {
  earcade_v1: {
    id: "earcade_v1",
    title: "E.Arcade Research",
    description: "Help us decide what to build. 2 questions, 5 XP.",
    xpReward: 20,
    questions: [
      {
        key: "build_first",
        title: "What should we build first?",
        options: [
          { value: "mini_games", label: "Mini-games" },
          { value: "social_hub", label: "Social hub (chat, hang out)" },
          { value: "competitions", label: "Competitions & rankings" },
          { value: "secret_floors", label: "Secret floors to explore" },
        ],
      },
      {
        key: "play_style",
        title: "How would you play?",
        options: [
          { value: "solo", label: "Solo" },
          { value: "with_friends", label: "With friends" },
          { value: "against_everyone", label: "Against everyone" },
          { value: "spectate", label: "Just spectate" },
        ],
      },
    ],
  },
};
