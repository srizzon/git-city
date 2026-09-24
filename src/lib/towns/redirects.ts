// Old league URLs, kept alive after the rename. Next keeps the query string
// (?invite=, ?ref=, ?t=) on redirects by default. /leagues/verify is listed
// before /leagues and never matches /league/:slug*, so no rule loops.
export const TOWN_REDIRECTS = [
  { source: "/leagues/verify", destination: "/towns/verify", permanent: true },
  { source: "/leagues", destination: "/towns", permanent: true },
  { source: "/league/:slug*", destination: "/town/:slug*", permanent: true },
] as const;
