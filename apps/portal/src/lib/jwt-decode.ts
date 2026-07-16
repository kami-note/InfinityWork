/**
 * Decodes a JWT payload without verifying its signature — fine for the one
 * thing middleware uses it for (deciding "is this close to expiring, should
 * I refresh proactively"), since every real authorization decision still
 * happens server-side where the signature IS verified (see
 * @infinitywork/shared's verifyAccessToken).
 */
export function decodeJwtExpiry(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(json) as { exp?: number };
    return exp ?? null;
  } catch {
    return null;
  }
}
