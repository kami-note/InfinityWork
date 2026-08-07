import { prisma } from "../infrastructure/prisma.js";

const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 } as const;
export type AclRole = keyof typeof ROLE_RANK;
export type ShareRole = "viewer" | "editor";

export class ForbiddenResourceError extends Error {
  constructor(resourceId: string) {
    super(`Access denied to resource ${resourceId}`);
  }
}

export class NotResourceOwnerError extends Error {
  constructor(resourceId: string) {
    super(`Caller is not the owner of resource ${resourceId}`);
  }
}

function roleSatisfies(granted: AclRole, minRole: AclRole): boolean {
  return ROLE_RANK[granted] >= ROLE_RANK[minRole];
}

function roleRank(role: AclRole): number {
  return ROLE_RANK[role];
}

/**
 * Resource-level ACL, separate from the RBAC permission strings checked by
 * the auth middleware. RBAC answers "can this user upload files at all";
 * this answers "can this user touch this specific file/folder" (Drive-style
 * sharing with folder inheritance).
 *
 * Ownership lives on ownerId columns. Share grants are viewer|editor only.
 * When walking ancestors, folder.ownerId also grants access (so a folder
 * owner can see files uploaded into that folder by a collaborator).
 */
export async function requireFileRole(fileId: string, userId: string, minRole: AclRole): Promise<void> {
  const file = await prisma.file.findUniqueOrThrow({
    where: { id: fileId },
    select: { id: true, ownerId: true, folderId: true, deletedAt: true },
  });
  if (file.deletedAt) throw new ForbiddenResourceError(fileId);
  if (file.ownerId === userId) return;

  if (minRole !== "owner") {
    const grant = await prisma.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId } },
    });
    if (grant && roleSatisfies(grant.role, minRole)) return;

    if (await ancestorGrantsAccess(file.folderId, userId, minRole)) return;
  }

  throw new ForbiddenResourceError(fileId);
}

export async function requireFolderRole(folderId: string, userId: string, minRole: AclRole): Promise<void> {
  const folder = await prisma.folder.findUniqueOrThrow({
    where: { id: folderId },
    select: { id: true, ownerId: true, parentId: true, deletedAt: true },
  });
  if (folder.deletedAt) throw new ForbiddenResourceError(folderId);
  if (folder.ownerId === userId) return;

  if (minRole !== "owner") {
    const grant = await prisma.folderPermission.findUnique({
      where: { folderId_userId: { folderId, userId } },
    });
    if (grant && roleSatisfies(grant.role, minRole)) return;

    if (await ancestorGrantsAccess(folder.parentId, userId, minRole)) return;
  }

  throw new ForbiddenResourceError(folderId);
}

/** True if any ancestor folder is owned by userId or has a sufficient FolderPermission. */
async function ancestorGrantsAccess(
  startFolderId: string | null,
  userId: string,
  minRole: AclRole,
): Promise<boolean> {
  let current = startFolderId;
  while (current) {
    const folder = await prisma.folder.findUnique({
      where: { id: current },
      select: { id: true, ownerId: true, parentId: true, deletedAt: true },
    });
    if (!folder || folder.deletedAt) return false;
    if (folder.ownerId === userId) return true;

    const grant = await prisma.folderPermission.findUnique({
      where: { folderId_userId: { folderId: folder.id, userId } },
    });
    if (grant && roleSatisfies(grant.role, minRole)) return true;

    current = folder.parentId;
  }
  return false;
}

/** Effective ACL role for UI (null if no access). Owner column maps to "owner". */
export async function getEffectiveFileRole(fileId: string, userId: string): Promise<AclRole | null> {
  try {
    const file = await prisma.file.findUniqueOrThrow({
      where: { id: fileId },
      select: { ownerId: true, folderId: true, deletedAt: true },
    });
    if (file.deletedAt) return null;
    if (file.ownerId === userId) return "owner";

    let best: AclRole | null = null;
    const grant = await prisma.filePermission.findUnique({
      where: { fileId_userId: { fileId, userId } },
    });
    if (grant) best = grant.role;

    let current = file.folderId;
    while (current) {
      const folder = await prisma.folder.findUnique({
        where: { id: current },
        select: { id: true, ownerId: true, parentId: true, deletedAt: true },
      });
      if (!folder || folder.deletedAt) break;
      if (folder.ownerId === userId) return "owner";

      const folderGrant = await prisma.folderPermission.findUnique({
        where: { folderId_userId: { folderId: folder.id, userId } },
      });
      if (folderGrant && (!best || roleRank(folderGrant.role) > roleRank(best))) {
        best = folderGrant.role;
      }
      current = folder.parentId;
    }
    return best;
  } catch {
    return null;
  }
}

export async function assertResourceOwner(
  kind: "file" | "folder",
  id: string,
  userId: string,
): Promise<void> {
  if (kind === "file") {
    const file = await prisma.file.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
    if (file.ownerId !== userId) throw new NotResourceOwnerError(id);
  } else {
    const folder = await prisma.folder.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
    if (folder.ownerId !== userId) throw new NotResourceOwnerError(id);
  }
}

/** Whether fileId sits under folderId in the folder tree (inclusive of direct children). */
export async function isFileUnderFolder(fileId: string, folderId: string): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { folderId: true, deletedAt: true },
  });
  if (!file || file.deletedAt) return false;
  let current = file.folderId;
  while (current) {
    if (current === folderId) return true;
    const folder = await prisma.folder.findUnique({
      where: { id: current },
      select: { parentId: true, deletedAt: true },
    });
    if (!folder || folder.deletedAt) return false;
    current = folder.parentId;
  }
  return false;
}

/** Highest ancestor (closest to root) the user can still access, or null if only the leaf. */
export async function highestAccessibleAncestor(
  folderId: string,
  userId: string,
): Promise<string | null> {
  const trail: string[] = [];
  let current: string | null = folderId;
  while (current) {
    trail.push(current);
    const folder: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = folder?.parentId ?? null;
  }

  // trail[0] = leaf, trail[last] = nearest root. Find farthest from leaf that is still accessible.
  let highest: string | null = null;
  for (let i = trail.length - 1; i >= 0; i--) {
    try {
      await requireFolderRole(trail[i]!, userId, "viewer");
      highest = trail[i]!;
      break;
    } catch {
      // keep looking toward the leaf
    }
  }
  return highest;
}
