// Runs the reel CLI (./index.ts) with the app's path aliases, outside Next.
// `server-only` is a Next marker: here it's an empty module.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const jiti = createJiti(import.meta.url, {
  jsx: true,
  alias: {
    "@/": `${root}/src/`,
    "@trailer-kit/": `${root}/.claude/skills/gg/kit/src/`,
    "server-only": `${root}/src/lib/reel/cli/empty.ts`,
  },
});
await jiti.import("./index.ts");
