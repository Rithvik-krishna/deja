// `api/client.ts` throws `Error("<status> <path>: <detail>")` for HTTP errors; fetch() itself throws TypeError when the server is unreachable.
export function errorMessage(e: unknown): string {
  if (e instanceof TypeError) return "Can't reach the Déjà API. Check that the backend is running, then try again.";
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
