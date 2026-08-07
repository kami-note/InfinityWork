import sharp from "sharp";
import PQueue from "p-queue";
import { Readable } from "node:stream";
import { prisma } from "../infrastructure/prisma.js";
import type { StorageProvider } from "../domain/storage-provider.js";

const queue = new PQueue({ concurrency: 2 });

export async function enqueueThumbnailGeneration(storage: StorageProvider, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || !file.mimeType.startsWith("image/")) {
    return;
  }

  // Update status to pending immediately
  await prisma.file.update({
    where: { id: fileId },
    data: { thumbnailStatus: "pending" },
  });

  // Enqueue the actual processing
  queue.add(async () => {
    try {
      // Re-fetch to ensure it wasn't deleted
      const currentFile = await prisma.file.findUnique({ where: { id: fileId } });
      if (!currentFile || currentFile.deletedAt) return;

      const stream = storage.read(currentFile.storageKey);

      // Convert stream to buffer for sharp
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      const thumbnailBuffer = await sharp(buffer)
        .resize(256, 256, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();

      const thumbnailStream = Readable.from(thumbnailBuffer);
      const stored = await storage.write(thumbnailStream);

      await prisma.file.update({
        where: { id: fileId },
        data: {
          thumbnailStatus: "ready",
          thumbnailStorageKey: stored.storageKey,
        },
      });
    } catch (error) {
      console.error(`Failed to generate thumbnail for file ${fileId}:`, error);
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: { thumbnailStatus: "failed" },
        });
      } catch (updateError) {
        console.error(`Failed to mark thumbnail as failed for file ${fileId}:`, updateError);
      }
    }
  });
}
