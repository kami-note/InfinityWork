import { prisma } from "../infrastructure/prisma.js";
import type { StorageProvider } from "../domain/storage-provider.js";
import { copyFile } from "./file-service.js";

// Limit concurrency when copying large folder trees to avoid CPU/disk overload.
const pLimit = (await import("p-limit")).default;

/**
 * Recursively duplicates a folder: creates the new folder, copies every
 * file inside it, then recurses into subfolders. Only the top-level folder
 * gets the "Cópia de ..." name — everything underneath keeps its original
 * name, matching how Drive-style copy behaves.
 */
export async function copyFolder(
  storage: StorageProvider,
  params: { id: string; ownerId: string; targetParentId: string | null; rename: boolean },
) {
  const original = await prisma.folder.findUniqueOrThrow({ where: { id: params.id } });

  const newFolder = await prisma.folder.create({
    data: {
      name: params.rename ? `Cópia de ${original.name}` : original.name,
      ownerId: params.ownerId,
      parentId: params.targetParentId,
    },
  });

  const [childFiles, childFolders] = await Promise.all([
    prisma.file.findMany({ where: { folderId: params.id, deletedAt: null } }),
    prisma.folder.findMany({ where: { parentId: params.id, deletedAt: null } }),
  ]);
  const limit = pLimit(4);
  // Copy files in parallel within a concurrency limit.
  await Promise.all(
    childFiles.map((file: any) =>
      limit(() =>
        copyFile(storage, {
          id: file.id,
          ownerId: params.ownerId,
          targetFolderId: newFolder.id,
          rename: false,
        }),
      ),
    ),
  );

  // Recurse into subfolders in parallel within the same concurrency limit.
  await Promise.all(
    childFolders.map((childFolder: any) =>
      limit(() =>
        copyFolder(storage, {
          id: childFolder.id,
          ownerId: params.ownerId,
          targetParentId: newFolder.id,
          rename: false,
        }),
      ),
    ),
  );

  return newFolder;
}
