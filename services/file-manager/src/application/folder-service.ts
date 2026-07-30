import { prisma } from "../infrastructure/prisma.js";
import {
  highestAccessibleAncestor,
  requireFolderRole,
  ForbiddenResourceError,
} from "./access-control.js";

export async function createFolder(ownerId: string, name: string, parentId: string | null) {
  return prisma.folder.create({ data: { name, ownerId, parentId } });
}

export async function renameFolder(id: string, name: string) {
  return prisma.folder.update({ where: { id }, data: { name } });
}

export async function moveFolder(id: string, parentId: string | null) {
  if (parentId) {
    await assertNotDescendant(id, parentId);
  }
  return prisma.folder.update({ where: { id }, data: { parentId } });
}

/** Prevents moving a folder into one of its own descendants (would create a cycle). */
async function assertNotDescendant(folderId: string, candidateParentId: string) {
  let current: string | null = candidateParentId;
  while (current) {
    if (current === folderId) throw new Error("Cannot move a folder into its own descendant");
    const parent: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parent?.parentId ?? null;
  }
}

export async function softDeleteFolder(id: string) {
  return prisma.folder.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreFolder(id: string) {
  return prisma.folder.update({ where: { id }, data: { deletedAt: null } });
}

export async function getFolder(id: string) {
  return prisma.folder.findUniqueOrThrow({ where: { id } });
}

/**
 * Dual-mode listing:
 * - If caller owns the folder (or parentId is null / "My Drive root"): filter by ownerId.
 * - If caller has ACL access but is not owner: list all children of that folder (no ownerId filter).
 */
export async function listFolderContents(userId: string, folderId: string | null) {
  if (folderId === null) {
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { ownerId: userId, parentId: null, deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.file.findMany({
        where: { ownerId: userId, folderId: null, deletedAt: null },
        orderBy: { name: "asc" },
      }),
    ]);
    return { folders, files, mode: "owned" as const };
  }

  const folder = await prisma.folder.findUniqueOrThrow({
    where: { id: folderId },
    select: { id: true, ownerId: true, deletedAt: true },
  });
  if (folder.deletedAt) throw new ForbiddenResourceError(folderId);

  await requireFolderRole(folderId, userId, "viewer");

  if (folder.ownerId === userId) {
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { ownerId: userId, parentId: folderId, deletedAt: null },
        orderBy: { name: "asc" },
      }),
      prisma.file.findMany({
        where: { ownerId: userId, folderId, deletedAt: null },
        orderBy: { name: "asc" },
      }),
    ]);
    return { folders, files, mode: "owned" as const };
  }

  // Shared folder: list every child regardless of ownerId (collaborator uploads included).
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.file.findMany({
      where: { folderId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);
  return { folders, files, mode: "shared" as const };
}

/**
 * Breadcrumb cut at the highest ancestor the user can still access,
 * so shared recipients don't see folder names above their grant.
 */
export async function breadcrumbForUser(folderId: string | null, userId: string) {
  if (!folderId) return [];

  const cutoff = await highestAccessibleAncestor(folderId, userId);
  if (!cutoff) return [];

  const trail: { id: string; name: string }[] = [];
  let current: string | null = folderId;
  while (current) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: current },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    trail.unshift({ id: folder.id, name: folder.name });
    if (folder.id === cutoff) break;
    current = folder.parentId;
  }
  return trail;
}

export async function breadcrumbFromRoot(folderId: string | null, stopAtId?: string | null) {
  const trail: { id: string; name: string }[] = [];
  let current = folderId;
  while (current) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: current },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    trail.unshift({ id: folder.id, name: folder.name });
    if (stopAtId && folder.id === stopAtId) break;
    current = folder.parentId;
  }
  return trail;
}

/** @deprecated use breadcrumbForUser — kept name for any leftover imports during refactor */
export async function breadcrumb(folderId: string | null) {
  return breadcrumbFromRoot(folderId);
}
