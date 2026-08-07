import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../infrastructure/prisma.js";
import type { ShareRole } from "./access-control.js";

export type ShareRoleInput = ShareRole;

export async function shareFile(fileId: string, userId: string, role: ShareRoleInput) {
  return prisma.filePermission.upsert({
    where: { fileId_userId: { fileId, userId } },
    update: { role },
    create: { fileId, userId, role },
  });
}

export async function unshareFile(fileId: string, userId: string) {
  await prisma.filePermission.deleteMany({ where: { fileId, userId } });
}

export async function listFilePermissions(fileId: string) {
  return prisma.filePermission.findMany({ where: { fileId } });
}

export async function shareFolder(folderId: string, userId: string, role: ShareRoleInput) {
  return prisma.folderPermission.upsert({
    where: { folderId_userId: { folderId, userId } },
    update: { role },
    create: { folderId, userId, role },
  });
}

export async function unshareFolder(folderId: string, userId: string) {
  await prisma.folderPermission.deleteMany({ where: { folderId, userId } });
}

export async function listFolderPermissions(folderId: string) {
  return prisma.folderPermission.findMany({ where: { folderId } });
}

export async function listSharedWithMe(userId: string) {
  const [fileGrants, folderGrants] = await Promise.all([
    prisma.filePermission.findMany({
      where: { userId, file: { deletedAt: null } },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            folderId: true,
            size: true,
            mimeType: true,
            thumbnailStatus: true,
            createdAt: true,
            updatedAt: true,
            ownerId: true,
          },
        },
      },
    }),
    prisma.folderPermission.findMany({
      where: { userId, folder: { deletedAt: null } },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
            parentId: true,
            updatedAt: true,
            ownerId: true,
          },
        },
      },
    }),
  ]);

  return {
    files: fileGrants.map((g) => ({ ...g.file, role: g.role })),
    folders: folderGrants.map((g) => ({ ...g.folder, role: g.role })),
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export async function createShareLink(params: {
  targetType: "file" | "folder";
  targetId: string;
  createdBy: string;
  expiresAt?: Date | null;
}) {
  const { token, tokenHash } = generateShareToken();

  await prisma.shareLink.updateMany({
    where: {
      targetType: params.targetType,
      targetId: params.targetId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const link = await prisma.shareLink.create({
    data: {
      tokenHash,
      targetType: params.targetType,
      targetId: params.targetId,
      role: "viewer",
      expiresAt: params.expiresAt ?? null,
      createdBy: params.createdBy,
    },
  });

  return { link, token };
}

export async function listShareLinks(targetType: "file" | "folder", targetId: string) {
  return prisma.shareLink.findMany({
    where: { targetType, targetId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeShareLink(linkId: string, createdBy: string) {
  const link = await prisma.shareLink.findUniqueOrThrow({ where: { id: linkId } });
  if (link.createdBy !== createdBy) {
    throw new Error("forbidden");
  }
  return prisma.shareLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });
}

export class InvalidShareLinkError extends Error {
  constructor(message = "invalid_share_link") {
    super(message);
  }
}

export async function resolveShareLink(token: string) {
  const tokenHash = hashToken(token);
  const link = await prisma.shareLink.findUnique({ where: { tokenHash } });
  if (!link || link.revokedAt) throw new InvalidShareLinkError();
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    throw new InvalidShareLinkError("expired_share_link");
  }

  // Defense in depth: reject if stored hash somehow doesn't match (shouldn't happen).
  const a = Buffer.from(link.tokenHash, "utf8");
  const b = Buffer.from(tokenHash, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new InvalidShareLinkError();
  }

  return link;
}
