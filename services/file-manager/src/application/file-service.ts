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

/**
 * Overwrites the physical bytes of an existing file while keeping the same
 * file id — used by the docs module so saving a document updates the same
 * Drive item instead of spawning a new file on every save. The old physical
 * object is deleted only after the new one is safely written.
 */
export async function updateFileContent(
  storage: StorageProvider,
  params: { id: string; mimeType: string; stream: Readable },
) {
  const existing = await prisma.file.findUniqueOrThrow({ where: { id: params.id } });
  const stored = await storage.write(params.stream);
  const updated = await prisma.file.update({
    where: { id: params.id },
    data: {
      storageKey: stored.storageKey,
      size: stored.size,
      mimeType: params.mimeType,
      checksumSha256: stored.checksumSha256,
    },
  });
  await storage.delete(existing.storageKey);
  return updated;
}

/**
 * Duplicates a file's physical bytes into a new storage object and a new
 * DB row — a real copy, not a reference, since there's no dedup/refcounting
 * in this storage model. `rename` controls whether the top-level copy gets
 * the "Cópia de ..." prefix (used for a direct copy) or keeps the original
 * name (used for files nested inside a folder being copied).
 */
export async function copyFile(
  storage: StorageProvider,
  params: { id: string; ownerId: string; targetFolderId: string | null; rename: boolean },
) {
  const original = await prisma.file.findUniqueOrThrow({ where: { id: params.id } });
  // Avoid recomputing SHA-256: ask storage to copy the existing object and
  // reuse the checksum already stored in the DB for the original file.
  const stored = await storage.copyFrom(original.storageKey, original.checksumSha256);
  return prisma.file.create({
    data: {
      name: params.rename ? `Cópia de ${original.name}` : original.name,
      folderId: params.targetFolderId,
      ownerId: params.ownerId,
      storageKey: stored.storageKey,
      size: stored.size,
      mimeType: original.mimeType,
      // Persist original checksum to avoid recomputing on copy.
      checksumSha256: original.checksumSha256,
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
  // Delete objects in parallel but limit concurrency to avoid overwhelming the host.
  // Use a small concurrency limit (4) to reduce CPU/disk contention.
  const pLimit = (await import("p-limit")).default;
  const limit = pLimit(4);
  await Promise.all(trashed.map((f: any) => limit(() => storage.delete(f.storageKey))));
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

export async function getFile(id: string) {
  return prisma.file.findUniqueOrThrow({ where: { id } });
}

export async function getStorageUsage(ownerId: string): Promise<{ totalBytes: string }> {
  const result = await prisma.file.aggregate({
    where: { ownerId, deletedAt: null },
    _sum: { size: true },
  });
  return { totalBytes: (result._sum.size ?? 0n).toString() };
}
