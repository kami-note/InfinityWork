/**
 * Permission strings follow the pattern: <dominio>.<recurso>.<acao>
 * Each module owns and exports its own slice of this table — adding a module
 * never requires touching the auth service.
 */
export const PERMISSIONS = {
  files: {
    folder: {
      create: "files.folder.create",
      rename: "files.folder.rename",
      delete: "files.folder.delete",
      move: "files.folder.move",
    },
    file: {
      upload: "files.file.upload",
      download: "files.file.download",
      rename: "files.file.rename",
      delete: "files.file.delete",
      move: "files.file.move",
      share: "files.file.share",
    },
    trash: {
      restore: "files.trash.restore",
      empty: "files.trash.empty",
    },
  },
  docs: {
    document: {
      create: "docs.document.create",
      edit: "docs.document.edit",
      export: "docs.document.export",
    },
  },
  users: {
    user: {
      invite: "users.user.invite",
      manage: "users.user.manage",
      lookup: "users.user.lookup",
    },
    role: {
      manage: "users.role.manage",
    },
  },
  admin: {
    system: {
      manage: "admin.system.manage",
    },
  },
} as const;

export const DEFAULT_ROLES = {
  admin: ["*.*.*"],
  editor: [
    PERMISSIONS.files.folder.create,
    PERMISSIONS.files.folder.rename,
    PERMISSIONS.files.folder.move,
    PERMISSIONS.files.file.upload,
    PERMISSIONS.files.file.download,
    PERMISSIONS.files.file.rename,
    PERMISSIONS.files.file.move,
    PERMISSIONS.files.file.share,
    PERMISSIONS.files.trash.restore,
    PERMISSIONS.docs.document.create,
    PERMISSIONS.docs.document.edit,
    PERMISSIONS.docs.document.export,
    PERMISSIONS.users.user.lookup,
  ],
  viewer: [PERMISSIONS.files.file.download],
} as const;

/**
 * Matches a required permission against a granted permission, honoring
 * wildcard segments ("*") the same way the AWS IAM / Django-style tables do.
 */
export function permissionMatches(granted: string, required: string): boolean {
  const grantedParts = granted.split(".");
  const requiredParts = required.split(".");
  if (grantedParts.length !== requiredParts.length) return false;
  return grantedParts.every((part, i) => part === "*" || part === requiredParts[i]);
}

export function hasPermission(grantedList: readonly string[], required: string): boolean {
  return grantedList.some((granted) => permissionMatches(granted, required));
}
