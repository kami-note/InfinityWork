import { prisma } from "../infrastructure/prisma.js";
import type { StorageProvider } from "../domain/storage-provider.js";
import { copyFile } from "./file-service.js";

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

  for (const file of childFiles) {
    await copyFile(storage, {
      id: file.id,
      ownerId: params.ownerId,
      targetFolderId: newFolder.id,
      rename: false,
    });
  }

  for (const childFolder of childFolders) {
    await copyFolder(storage, {
      id: childFolder.id,
      ownerId: params.ownerId,
      targetParentId: newFolder.id,
      rename: false,
    });
  }

  return newFolder;
}
