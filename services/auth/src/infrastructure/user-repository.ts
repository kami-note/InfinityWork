import { prisma } from "./prisma.js";
import type { AuthenticatedUser } from "../domain/types.js";

export async function findUserWithPermissionsByEmail(
  email: string,
): Promise<(AuthenticatedUser & { passwordHash: string }) | null> {
  const user = await prisma.user.findUnique({
    where: { email, disabledAt: null },
    include: {
      userRoles: {
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!user) return null;
  return toAuthenticatedUser(user);
}

export async function findUserWithPermissionsById(
  id: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id, disabledAt: null },
    include: {
      userRoles: {
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
    },
  });
  if (!user) return null;
  const { passwordHash: _passwordHash, ...rest } = toAuthenticatedUser(user);
  return rest;
}

/** Exact email match (case-insensitive). Returns public profile fields only. */
export async function findUserPublicByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      disabledAt: null,
    },
    select: { id: true, email: true, name: true },
  });
  return user;
}

function toAuthenticatedUser(user: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  userRoles: { role: { name: string; rolePermissions: { permission: { key: string } }[] } }[];
}): AuthenticatedUser & { passwordHash: string } {
  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = Array.from(
    new Set(user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key))),
  );
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    roles,
    permissions,
  };
}
