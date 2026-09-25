import { ADS_PREVIEWS } from "./ads";
import { GAME_PREVIEWS } from "./game";
import { JOBS_PREVIEWS } from "./jobs";
import { TOWNS_PREVIEWS } from "./towns";
import type { EmailPreviews } from "./types";

export const EMAIL_PREVIEWS: EmailPreviews = {
  ...GAME_PREVIEWS,
  ...TOWNS_PREVIEWS,
  ...JOBS_PREVIEWS,
  ...ADS_PREVIEWS,
};
