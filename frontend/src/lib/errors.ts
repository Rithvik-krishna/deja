// `api/client.ts` throws `Error("<status> <path>: <detail>")` for HTTP errors; fetch() itself throws TypeError when the server is unreachable.
export function errorMessage(e: unknown): string {
  if (e instanceof TypeError) return "Can't reach the Déjà API. Check that the backend is running, then try again.";
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/**
 * `api/client.ts` formats HTTP failures as `"<status> <path>: <detail>"`. Returns the status and detail, or null for
 * errors (or already-formatted messages) that did not come from an HTTP response (e.g. the server is unreachable).
 */
export function parseApiError(e: unknown): { status: number; detail: string } | null {
  const text = typeof e === "string" ? e : e instanceof Error ? e.message : null;
  if (text === null) return null;
  const m = /^(\d{3}) \S+: (.*)$/s.exec(text);
  return m ? { status: Number(m[1]), detail: m[2] } : null;
}
