import { prisma } from "../infrastructure/prisma.js";

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

export async function listFolderContents(ownerId: string, folderId: string | null) {
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({ where: { ownerId, parentId: folderId, deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.file.findMany({ where: { ownerId, folderId, deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return { folders, files };
}

export async function breadcrumb(folderId: string | null) {
  const trail: { id: string; name: string }[] = [];
  let current = folderId;
  while (current) {
    const folder: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: current },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) break;
    trail.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return trail;
}
