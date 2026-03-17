import "server-only";

type UserLike = {
  user_metadata?: {
    user_name?: string;
    preferred_username?: string;
  };
} | null | undefined;

export function getGithubLoginFromUser(user: UserLike): string {
  return (
    user?.user_metadata?.user_name ??
    user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();
}

export function getAdminGithubLogins(): string[] {
  return (process.env.ADMIN_GITHUB_LOGINS ?? "")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminGithubLogin(login: string): boolean {
  return getAdminGithubLogins().includes(login.trim().toLowerCase());
}
