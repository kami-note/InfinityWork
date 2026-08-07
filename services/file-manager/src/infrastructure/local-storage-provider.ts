import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, copyFile as copyFileFs } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { ByteRange, StorageProvider, StoredObject } from "../domain/storage-provider.js";

export class UploadTooLargeError extends Error {}

/**
 * Local filesystem backend. Files are shard by the first two hex chars of
 * their generated UUID (storage/ab/ab12...) so a single directory never
 * accumulates enough entries to slow down ext4 directory listings.
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly root: string,
    private readonly maxBytes: number,
  ) {}

  private pathFor(storageKey: string): string {
    return join(this.root, storageKey.slice(0, 2), storageKey);
  }

  async write(stream: Readable): Promise<StoredObject> {
    const storageKey = randomUUID();
    const destPath = this.pathFor(storageKey);
    await mkdir(dirname(destPath), { recursive: true });

    const hash = createHash("sha256");
    let size = 0;
    const maxBytes = this.maxBytes;

    const hashingPassthrough = new Transform({
      transform(chunk, _enc, callback) {
        size += chunk.length;
        if (size > maxBytes) {
          callback(new UploadTooLargeError(`Upload exceeds ${maxBytes} bytes`));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(stream, hashingPassthrough, createWriteStream(destPath));
    } catch (err) {
      await rm(destPath, { force: true });
      throw err;
    }

    return { storageKey, size, checksumSha256: hash.digest("hex") };
  }

  read(storageKey: string, range?: ByteRange): Readable {
    return createReadStream(this.pathFor(storageKey), range ? { start: range.start, end: range.end } : undefined);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  async copyFrom(storageKey: string, checksumSha256: string | null = null): Promise<StoredObject> {
    const srcPath = this.pathFor(storageKey);
    const newKey = randomUUID();
    const destPath = this.pathFor(newKey);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFileFs(srcPath, destPath);
    const st = await stat(destPath);
    // If caller provided a checksum, trust it to avoid recomputing.
    if (checksumSha256) {
      return { storageKey: newKey, size: st.size, checksumSha256: checksumSha256 };
    }
    // Fallback: compute checksum (rare path).
    const hash = createHash("sha256");
    const stream = createReadStream(destPath);
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return { storageKey: newKey, size: st.size, checksumSha256: hash.digest("hex") };
  }
}
