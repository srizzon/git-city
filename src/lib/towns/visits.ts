// A qualified visit: a signed-in dev who isn't a member of the town, who
// stayed 30+ seconds or started driving there. Counted once per UTC day.
export const VISIT_SECONDS = 30;

export function isQualified(v: { signedIn: boolean; member: boolean; seconds: number; drove: boolean }): boolean {
  if (!v.signedIn || v.member) return false;
  return v.drove || v.seconds >= VISIT_SECONDS;
}
