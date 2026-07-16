import type { Readable } from "node:stream";
import { prisma } from "../infrastructure/prisma.js";
import type { StorageProvider } from "../domain/storage-provider.js";

export async function uploadFile(
  storage: StorageProvider,
  params: { ownerId: string; folderId: string | null; name: string; mimeType: string; stream: Readable },
) {
  const stored = await storage.write(params.stream);
  return prisma.file.create({
    data: {
      name: params.name,
      folderId: params.folderId,
      ownerId: params.ownerId,
      storageKey: stored.storageKey,
      size: stored.size,
      mimeType: params.mimeType,
      checksumSha256: stored.checksumSha256,
    },
  });
}

export async function renameFile(id: string, name: string) {
  return prisma.file.update({ where: { id }, data: { name } });
}

export async function moveFile(id: string, folderId: string | null) {
  return prisma.file.update({ where: { id }, data: { folderId } });
}

export async function softDeleteFile(id: string) {
  return prisma.file.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreFile(id: string) {
  return prisma.file.update({ where: { id }, data: { deletedAt: null } });
}

export async function permanentlyDeleteFile(storage: StorageProvider, id: string) {
  const file = await prisma.file.findUniqueOrThrow({ where: { id } });
  await storage.delete(file.storageKey);
  await prisma.file.delete({ where: { id } });
}

export async function emptyTrash(storage: StorageProvider, ownerId: string) {
  const trashed = await prisma.file.findMany({ where: { ownerId, deletedAt: { not: null } } });
  for (const file of trashed) {
    await storage.delete(file.storageKey);
  }
  await prisma.file.deleteMany({ where: { ownerId, deletedAt: { not: null } } });
  return { deleted: trashed.length };
}

export async function listTrash(ownerId: string) {
  return prisma.file.findMany({ where: { ownerId, deletedAt: { not: null } }, orderBy: { deletedAt: "desc" } });
}

export async function searchFiles(ownerId: string, query: string) {
  return prisma.file.findMany({
    where: { ownerId, deletedAt: null, name: { contains: query, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: 50,
  });
}

export async function shareFile(fileId: string, userId: string, role: "owner" | "editor" | "viewer") {
  return prisma.filePermission.upsert({
    where: { fileId_userId: { fileId, userId } },
    update: { role },
    create: { fileId, userId, role },
  });
}

export async function getFile(id: string) {
  return prisma.file.findUniqueOrThrow({ where: { id } });
}
