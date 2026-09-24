/** A league action the user can see fail: `message` is shown as-is. */
export class LeagueError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * A failed database write. The Postgres message goes to the logs, never to
 * the client: it can name tables, columns and constraints.
 */
export function dbError(code: string, err: unknown, message = "Something went wrong. Try again."): LeagueError {
  console.error(`[leagues:${code}]`, err);
  return new LeagueError(code, message, 500);
}
