// "Acme" → "Acme Town"; names that already end in "Town" stay as they are.
export function townDisplayName(name: string): string {
  const trimmed = name.trim();
  return /\btown$/i.test(trimmed) ? trimmed : `${trimmed} Town`;
}
