import argon2 from "argon2";
import ms from "ms";
import { signAccessToken, signRefreshToken } from "@infinitywork/shared";
import {
  findUserWithPermissionsByEmail,
  findUserWithPermissionsById,
} from "../infrastructure/user-repository.js";
import {
  consumeRefreshToken,
  storeRefreshToken,
  revokeAllForUser,
} from "../infrastructure/refresh-token-repository.js";

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? "7d";

export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}

async function issueTokenPair(user: { id: string; email: string; roles: string[]; permissions: string[] }) {
  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email, roles: user.roles, permissions: user.permissions },
    JWT_SECRET,
    ACCESS_TTL,
  );
  const refreshToken = await signRefreshToken(user.id, JWT_SECRET, REFRESH_TTL);
  await storeRefreshToken(user.id, refreshToken, new Date(Date.now() + ms(REFRESH_TTL)));
  return { accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await findUserWithPermissionsByEmail(email);
  if (!user) throw new InvalidCredentialsError();

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) throw new InvalidCredentialsError();

  return issueTokenPair(user);
}

export async function refresh(refreshToken: string) {
  const userId = await consumeRefreshToken(refreshToken);
  if (!userId) throw new InvalidRefreshTokenError();

  const user = await findUserWithPermissionsById(userId);
  if (!user) throw new InvalidRefreshTokenError();

  return issueTokenPair(user);
}

export async function logout(userId: string) {
  await revokeAllForUser(userId);
}
