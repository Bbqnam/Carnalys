// Shared bearer check for endpoints that only Vercel Cron (or an operator
// holding CRON_SECRET) may call. Never authorizes when the secret is unset, so
// a misconfigured deployment fails closed rather than exposing the endpoint.

export function isCronAuthorized(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
