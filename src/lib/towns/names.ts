// "Acme" → "Acme Town"; names that already end in "Town" or "City" stay as
// they are ("Ship City", not "Ship City Town").
export function townDisplayName(name: string): string {
  const trimmed = name.trim();
  return /\b(town|city)$/i.test(trimmed) ? trimmed : `${trimmed} Town`;
}
