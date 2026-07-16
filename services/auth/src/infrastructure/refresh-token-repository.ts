import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(userId: string, token: string, expiresAt: Date) {
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
}

/** Returns the userId if the token is valid and not revoked/expired, otherwise null. */
export async function consumeRefreshToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) return null;
  // Rotate: revoke the used token so it can't be replayed.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return record.userId;
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
