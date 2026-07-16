import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

/**
 * Plain (non-JWTPayload) shape for the signing input. Omit<AccessTokenClaims, ...>
 * doesn't work here: JWTPayload carries a string index signature, which makes
 * keyof AccessTokenClaims collapse to `string` and Omit/Pick resolve every
 * field to the index signature's `unknown` instead of its declared type.
 */
interface AccessTokenClaimsInput {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: AccessTokenClaimsInput,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getSecretKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  return payload as AccessTokenClaims;
}

export async function signRefreshToken(
  sub: string,
  secret: string,
  ttl: string,
): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getSecretKey(secret));
}

export async function verifyRefreshToken(token: string, secret: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  if (payload.typ !== "refresh" || !payload.sub) {
    throw new Error("Invalid refresh token");
  }
  return { sub: payload.sub };
}
