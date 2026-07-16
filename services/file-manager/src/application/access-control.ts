import { prisma } from "../infrastructure/prisma.js";

const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 } as const;
type Role = keyof typeof ROLE_RANK;

/**
 * Resource-level ACL, separate from the RBAC permission strings checked by
 * the auth middleware. RBAC answers "can this user upload files at all";
 * this answers "can this user touch this specific file" (Drive-style
 * per-file sharing).
 */
export async function requireFileRole(fileId: string, userId: string, minRole: Role): Promise<void> {
  const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } });
  if (file.ownerId === userId) return;

  const grant = await prisma.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId } },
  });
  if (!grant || ROLE_RANK[grant.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenResourceError(fileId);
  }
}

export class ForbiddenResourceError extends Error {
  constructor(resourceId: string) {
    super(`Access denied to resource ${resourceId}`);
  }
}
