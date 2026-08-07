import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import sharp from "sharp";
import PQueue from "p-queue";
import { prisma } from "../infrastructure/prisma.js";
import type { StorageProvider } from "../domain/storage-provider.js";
import { isThumbnailableMime } from "./thumbnailable.js";

export const thumbnailQueue = new PQueue({ concurrency: 2 });

const THUMB_MAX_EDGE = 256;
const THUMB_JPEG_QUALITY = 70;

export async function enqueueThumbnailGeneration(storage: StorageProvider, fileId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || !isThumbnailableMime(file.mimeType)) {
    return;
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { thumbnailStatus: "pending" },
  });

  thumbnailQueue.add(async () => {
    try {
      const currentFile = await prisma.file.findUnique({ where: { id: fileId } });
      if (!currentFile || currentFile.deletedAt) return;

      const thumbnailBuffer = currentFile.mimeType.startsWith("video/")
        ? await sharp(await extractVideoFrame(storage, currentFile.storageKey))
            .rotate()
            .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: THUMB_JPEG_QUALITY })
            .toBuffer()
        : await resizeImageThumbnail(storage, currentFile.storageKey);

      const stored = await storage.write(Readable.from(thumbnailBuffer));

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

async function resizeImageThumbnail(storage: StorageProvider, storageKey: string): Promise<Buffer> {
  // Prefer on-disk path so sharp never holds the full original in a Node Buffer.
  const input = storage.localPath?.(storageKey) ?? (await bufferFromStorage(storage, storageKey));
  return sharp(input)
    .rotate()
    .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMB_JPEG_QUALITY })
    .toBuffer();
}

async function bufferFromStorage(storage: StorageProvider, storageKey: string): Promise<Buffer> {
  const stream = storage.read(storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Extract a single JPEG frame near 1s (falls back to the start). Prefers a
 * local filesystem path when the storage backend exposes one so ffmpeg can
 * seek without streaming the whole file through Node.
 */
async function extractVideoFrame(storage: StorageProvider, storageKey: string): Promise<Buffer> {
  const localPath = storage.localPath?.(storageKey);
  if (localPath) {
    try {
      return await runFfmpegFrame(["-ss", "1", "-i", localPath]);
    } catch {
      return await runFfmpegFrame(["-ss", "0", "-i", localPath]);
    }
  }

  // Stream fallback (e.g. future S3 backend): ffmpeg reads stdin once.
  try {
    return await runFfmpegFrame(["-i", "pipe:0", "-ss", "1"], storage.read(storageKey));
  } catch {
    return await runFfmpegFrame(["-i", "pipe:0", "-ss", "0"], storage.read(storageKey));
  }
}

function runFfmpegFrame(inputArgs: string[], stdin?: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...inputArgs,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    ff.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    ff.on("error", (error) => reject(error));
    ff.on("close", (code) => {
      if (code === 0 && out.length > 0) {
        resolve(Buffer.concat(out));
        return;
      }
      reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString("utf8")}`));
    });

    if (stdin) {
      stdin.on("error", (error) => {
        ff.kill("SIGKILL");
        reject(error);
      });
      stdin.pipe(ff.stdin!);
    } else {
      ff.stdin?.end();
    }
  });
}
