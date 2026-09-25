import { isTemplateId, type TemplateId } from "@/lib/league-city/templates";
import type { ScoringMode } from "@/lib/leagues/scoring";

/**
 * A company town's starter pick from a request body (used only when the join
 * creates the town), and what the dev's screen expected: to build it or to
 * move into it.
 */
export function startFrom(body: Record<string, unknown>): {
  template?: TemplateId;
  scoring?: ScoringMode;
  expect?: "create" | "join";
} {
  return {
    template: isTemplateId(body.template) ? body.template : undefined,
    scoring: body.scoring === "xp" || body.scoring === "contributions" ? body.scoring : undefined,
    expect: body.expect === "create" || body.expect === "join" ? body.expect : undefined,
  };
}
