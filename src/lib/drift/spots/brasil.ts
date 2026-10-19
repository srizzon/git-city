// Brasil Drift: the Brasil town's own track, on its own island in the
// south-east's sea, off the coast between São Paulo and Rio
// (lib/towns/brasil-drift.ts). Interlagos cut
// down to a drift course and run the same way round: the start straight into
// the S do Senna, the Curva do Sol onto a short Reta Oposta, the Descida do
// Lago, the Ferradura and the Laranjinha, the Pinheirinho hairpin, the Bico
// de Pato, the Mergulho, then the Junção and the long Subida dos Boxes back
// to the line. Dry asphalt. Laid facing west so the line sits on the site's
// north side, by the shore. Not on the /drift list: you drive to it.

import { SPRINT } from "../../league-city/race/track";
import { DRIFT_CENTER_M, DRIFT_HEADING } from "../../towns/brasil-drift";
import { left, path, right, straight, type Leg } from "./path";
import type { LiveSpot } from "./types";

// The two straights' lengths close the loop exactly.
const LEGS: Leg[] = [
  straight(37.22, "start"),
  left(70, 36, "senna"),
  right(62, 40),
  left(115, 19, "sol"),
  straight(19.811, "oposta"),
  left(83, 24, "lago"),
  straight(19),
  right(103, 19, "ferradura"),
  right(33, 40, "laranjinha"),
  left(171, 22, "pinheirinho"),
  straight(24),
  right(74, 19, "bico"),
  left(80, 37, "mergulho"),
  left(40, 70, "juncao"),
  left(73, 70, "subida"),
  straight(18, "grid"),
];

// Drawn from the origin first, then again so its middle sits on the site's.
const home = path(LEGS, [0, 0], DRIFT_HEADING, true);
const xs = home.points.map((p) => p[0]);
const zs = home.points.map((p) => p[1]);
const P = path(
  LEGS,
  [Math.round(DRIFT_CENTER_M[0] - (Math.min(...xs) + Math.max(...xs)) / 2), Math.round(DRIFT_CENTER_M[1] - (Math.min(...zs) + Math.max(...zs)) / 2)],
  DRIFT_HEADING,
  true,
);

const mid = (name: string) => (P.marks[name][0] + P.marks[name][1]) / 2;

export const BRASIL_DRIFT: LiveSpot = {
  id: "brasil",
  status: "live",
  name: "Brasil Drift",
  tagline: "Interlagos cut down to a drift course, on an island off the coast between São Paulo and Rio.",
  track: {
    ...SPRINT,
    id: "brasil",
    points: P.points,
    closed: true,
    width: 14,
    runoff: 3,
    splits: [4, 8, 11],
  },
  surface: "asphalt",
  clips: [
    { s: mid("pinheirinho") - 8, len: 16, side: 1, kind: "inner", depth: 2.5 },
    { s: mid("juncao") - 15, len: 30, side: -1, kind: "outer", depth: 2.5 },
  ],
  author: 50_000,
  minMs: 20_000,
};
