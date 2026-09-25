// Invite rewards only count GitHub accounts at least this old, so fresh alts
// can't farm welcome pixels or Town Builder.
export const MIN_ACCOUNT_AGE_DAYS = 30;

export function oldEnoughForInviteReward(accountCreatedAt: string | null | undefined, now = new Date()): boolean {
  if (!accountCreatedAt) return false;
  const created = new Date(accountCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created >= MIN_ACCOUNT_AGE_DAYS * 86_400_000;
}
