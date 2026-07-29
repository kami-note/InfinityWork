import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_CHUNK_UPLOAD_MAX_REQUEST_BYTES,
  DEFAULT_CHUNK_UPLOAD_SIZE_BYTES,
  expectedChunkByteLength,
  totalChunksForSize,
} from "@infinitywork/shared";
import type { StorageProvider } from "../domain/storage-provider.js";
import { prisma } from "../infrastructure/prisma.js";

export type UploadSessionStatus = "receiving" | "assembling" | "ready" | "failed";

export interface PersistedFileInput {
  name: string;
  folderId: string | null;
  ownerId: string;
  storageKey: string;
  size: number;
  mimeType: string;
  checksumSha256: string;
}

export type PersistFileFn = (data: PersistedFileInput) => Promise<{ id: string }>;
export type FindFileFn = (id: string) => Promise<unknown | null>;

export interface UploadSessionMeta {
  ownerId: string;
  name: string;
  mimeType: string;
  folderId: string | null;
  size: number;
  totalChunks: number;
  chunkSize: number;
  createdAt: string;
  status: UploadSessionStatus;
  fileId?: string;
  error?: string;
  completedAt?: string;
}

export type ChunkedUploadErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "upload_too_large"
  | "insufficient_storage"
  | "missing_chunks";

export class ChunkedUploadError extends Error {
  constructor(
    message: string,
    readonly code: ChunkedUploadErrorCode,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ChunkedUploadError";
  }
}

const TTL_MS = 24 * 60 * 60 * 1000;
const READY_RETENTION_MS = 60 * 60 * 1000;
const ASSEMBLING_GRACE_MS = 60 * 60 * 1000;

function partName(index: number): string {
  return `part-${String(index).padStart(4, "0")}`;
}

function defaultPersistFile(data: PersistedFileInput): Promise<{ id: string }> {
  return prisma.file.create({ data });
}

function defaultFindFile(id: string): Promise<unknown | null> {
  return prisma.file.findUnique({ where: { id } });
}

export interface ChunkedUploadServiceOptions {
  chunkSize?: number;
  maxRequestBytes?: number;
  maxUploadBytes?: number;
  persistFile?: PersistFileFn;
  findFile?: FindFileFn;
  freeBytes?: () => Promise<number>;
}

export class ChunkedUploadService {
  private readonly chunkSize: number;
  private readonly maxRequestBytes: number;
  private readonly maxUploadBytes: number;
  private readonly uploadsRoot: string;
  private readonly persistFile: PersistFileFn;
  private readonly findFile: FindFileFn;
  private readonly freeBytesFn?: () => Promise<number>;
  private readonly assembleQueue: string[] = [];
  private assembling = false;

  constructor(
    private readonly storageRoot: string,
    private readonly storage: StorageProvider,
    opts: ChunkedUploadServiceOptions = {},
  ) {
    this.chunkSize = opts.chunkSize ?? Number(process.env.CHUNK_UPLOAD_SIZE_BYTES ?? DEFAULT_CHUNK_UPLOAD_SIZE_BYTES);
    this.maxRequestBytes =
      opts.maxRequestBytes ??
      Number(process.env.CHUNK_UPLOAD_MAX_REQUEST_BYTES ?? DEFAULT_CHUNK_UPLOAD_MAX_REQUEST_BYTES);
    this.maxUploadBytes = opts.maxUploadBytes ?? Number(process.env.STORAGE_MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024);
    this.uploadsRoot = join(this.storageRoot, "_uploads");
    this.persistFile = opts.persistFile ?? defaultPersistFile;
    this.findFile = opts.findFile ?? defaultFindFile;
    this.freeBytesFn = opts.freeBytes;
  }

  private sessionDir(uploadId: string): string {
    return join(this.uploadsRoot, uploadId);
  }

  private metaPath(uploadId: string): string {
    return join(this.sessionDir(uploadId), "meta.json");
  }

  private async readMeta(uploadId: string): Promise<UploadSessionMeta> {
    try {
      return JSON.parse(await readFile(this.metaPath(uploadId), "utf8")) as UploadSessionMeta;
    } catch {
      throw new ChunkedUploadError("upload session not found", "not_found", 404);
    }
  }

  private async writeMeta(uploadId: string, meta: UploadSessionMeta): Promise<void> {
    const tmp = `${this.metaPath(uploadId)}.tmp`;
    await writeFile(tmp, JSON.stringify(meta, null, 2));
    await rename(tmp, this.metaPath(uploadId));
  }

  private assertOwner(meta: UploadSessionMeta, userId: string): void {
    if (meta.ownerId !== userId) throw new ChunkedUploadError("forbidden", "forbidden", 403);
  }

  private async requireOwnedSession(uploadId: string, userId: string): Promise<UploadSessionMeta> {
    const meta = await this.readMeta(uploadId);
    this.assertOwner(meta, userId);
    return meta;
  }

  private async listPartIndexes(uploadId: string, totalChunks: number): Promise<number[]> {
    let entries: string[];
    try {
      entries = await readdir(this.sessionDir(uploadId));
    } catch {
      return [];
    }
    return entries
      .map((name) => /^part-(\d{4})$/.exec(name))
      .filter((m): m is RegExpExecArray => m != null)
      .map((m) => Number(m[1]))
      .filter((index) => index >= 0 && index < totalChunks)
      .sort((a, b) => a - b);
  }

  private async removeParts(uploadId: string): Promise<void> {
    const entries = await readdir(this.sessionDir(uploadId));
    await Promise.all(
      entries.filter((n) => n.startsWith("part-")).map((n) => rm(join(this.sessionDir(uploadId), n), { force: true })),
    );
  }

  private async markFailed(uploadId: string, meta: UploadSessionMeta, error: string): Promise<void> {
    meta.status = "failed";
    meta.error = error;
    try {
      await this.writeMeta(uploadId, meta);
    } catch {
      // session may already be gone
    }
  }

  private openConcatenatedParts(uploadId: string, totalChunks: number): Readable {
    const dir = this.sessionDir(uploadId);
    return Readable.from(
      (async function* () {
        for (let i = 0; i < totalChunks; i++) {
          const part = createReadStream(join(dir, partName(i)));
          for await (const chunk of part) yield chunk;
        }
      })(),
    );
  }

  async createSession(params: {
    ownerId: string;
    name: string;
    mimeType: string;
    folderId: string | null;
    size: number;
  }): Promise<{ uploadId: string; totalChunks: number; chunkSize: number }> {
    if (!Number.isFinite(params.size) || params.size <= 0) {
      throw new ChunkedUploadError("invalid size", "invalid", 400);
    }
    if (params.size > this.maxUploadBytes) {
      throw new ChunkedUploadError("upload too large", "upload_too_large", 413);
    }
    if (!params.name?.trim()) {
      throw new ChunkedUploadError("name required", "invalid", 400);
    }

    const totalChunks = totalChunksForSize(params.size, this.chunkSize);
    const uploadId = randomUUID();
    await mkdir(this.sessionDir(uploadId), { recursive: true });

    await this.writeMeta(uploadId, {
      ownerId: params.ownerId,
      name: params.name.trim(),
      mimeType: params.mimeType || "application/octet-stream",
      folderId: params.folderId,
      size: params.size,
      totalChunks,
      chunkSize: this.chunkSize,
      createdAt: new Date().toISOString(),
      status: "receiving",
    });

    return { uploadId, totalChunks, chunkSize: this.chunkSize };
  }

  async listReceivedParts(uploadId: string, userId: string) {
    const meta = await this.requireOwnedSession(uploadId, userId);
    return { meta, receivedIndexes: await this.listPartIndexes(uploadId, meta.totalChunks) };
  }

  async putChunk(
    uploadId: string,
    userId: string,
    index: number,
    contentLength: number | null,
    body: Readable,
  ): Promise<void> {
    const meta = await this.requireOwnedSession(uploadId, userId);

    if (meta.status !== "receiving") {
      throw new ChunkedUploadError(`session is ${meta.status}`, "conflict", 409);
    }
    if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
      throw new ChunkedUploadError("invalid chunk index", "invalid", 400);
    }
    if (contentLength == null || !Number.isFinite(contentLength)) {
      throw new ChunkedUploadError("Content-Length required", "invalid", 400);
    }
    if (contentLength > this.maxRequestBytes) {
      throw new ChunkedUploadError("chunk too large", "invalid", 413);
    }

    const expected = expectedChunkByteLength(index, meta.size, meta.chunkSize, meta.totalChunks);
    if (contentLength !== expected) {
      throw new ChunkedUploadError(
        `expected Content-Length ${expected} for chunk ${index}, got ${contentLength}`,
        "invalid",
        400,
      );
    }

    const dest = join(this.sessionDir(uploadId), partName(index));
    const tmp = `${dest}.tmp`;
    let written = 0;
    const counting = new Transform({
      transform(chunk, _enc, callback) {
        written += chunk.length;
        if (written > expected) {
          callback(new ChunkedUploadError("chunk exceeded expected size", "invalid", 400));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(body, counting, createWriteStream(tmp));
      if (written !== expected) {
        throw new ChunkedUploadError(
          `chunk size mismatch: expected ${expected}, got ${written}`,
          "invalid",
          400,
        );
      }
      await rename(tmp, dest);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async getStatus(uploadId: string, userId: string) {
    const meta = await this.requireOwnedSession(uploadId, userId);

    if (meta.status === "ready" && meta.fileId) {
      return { status: "ready" as const, file: (await this.findFile(meta.fileId)) ?? undefined };
    }
    if (meta.status === "failed") {
      return { status: "failed" as const, error: meta.error ?? "assemble_failed" };
    }
    if (meta.status === "receiving") {
      return {
        status: "receiving" as const,
        receivedIndexes: await this.listPartIndexes(uploadId, meta.totalChunks),
      };
    }
    return { status: meta.status };
  }

  async requestComplete(uploadId: string, userId: string): Promise<{ uploadId: string }> {
    const meta = await this.requireOwnedSession(uploadId, userId);

    if (meta.status === "ready" || meta.status === "assembling") return { uploadId };
    if (meta.status === "failed") {
      throw new ChunkedUploadError(meta.error ?? "assemble_failed", "conflict", 409);
    }

    const received = new Set(await this.listPartIndexes(uploadId, meta.totalChunks));
    if (received.size !== meta.totalChunks) {
      throw new ChunkedUploadError(
        `missing chunks: have ${received.size}/${meta.totalChunks}`,
        "missing_chunks",
        400,
      );
    }

    for (let i = 0; i < meta.totalChunks; i++) {
      if (!received.has(i)) {
        throw new ChunkedUploadError(`missing chunk ${i}`, "missing_chunks", 400);
      }
      const expected = expectedChunkByteLength(i, meta.size, meta.chunkSize, meta.totalChunks);
      const st = await stat(join(this.sessionDir(uploadId), partName(i)));
      if (st.size !== expected) {
        throw new ChunkedUploadError(`chunk ${i} size mismatch on disk`, "invalid", 400);
      }
    }

    meta.status = "assembling";
    await this.writeMeta(uploadId, meta);
    this.enqueueAssemble(uploadId);
    return { uploadId };
  }

  async deleteSession(uploadId: string, userId: string): Promise<void> {
    const meta = await this.requireOwnedSession(uploadId, userId);
    if (meta.status === "assembling") {
      throw new ChunkedUploadError("cannot delete while assembling", "conflict", 409);
    }
    await rm(this.sessionDir(uploadId), { recursive: true, force: true });
  }

  private enqueueAssemble(uploadId: string): void {
    if (!this.assembleQueue.includes(uploadId)) this.assembleQueue.push(uploadId);
    void this.drainAssembleQueue();
  }

  private async drainAssembleQueue(): Promise<void> {
    if (this.assembling) return;
    this.assembling = true;
    try {
      while (this.assembleQueue.length > 0) {
        await this.assemble(this.assembleQueue.shift()!);
      }
    } finally {
      this.assembling = false;
    }
  }

  private async freeBytes(): Promise<number> {
    if (this.freeBytesFn) return this.freeBytesFn();
    const s = await statfs(this.storageRoot);
    return Number(s.bavail) * Number(s.bsize);
  }

  private async assemble(uploadId: string): Promise<void> {
    let meta: UploadSessionMeta;
    try {
      meta = await this.readMeta(uploadId);
    } catch {
      return;
    }
    if (meta.status !== "assembling") return;

    try {
      if ((await this.freeBytes()) < meta.size) {
        await this.markFailed(uploadId, meta, "insufficient_storage");
        return;
      }

      const stored = await this.storage.write(this.openConcatenatedParts(uploadId, meta.totalChunks));
      if (stored.size !== meta.size) {
        await this.storage.delete(stored.storageKey);
        throw new Error(`assembled size ${stored.size} != expected ${meta.size}`);
      }

      const file = await this.persistFile({
        name: meta.name,
        folderId: meta.folderId,
        ownerId: meta.ownerId,
        storageKey: stored.storageKey,
        size: stored.size,
        mimeType: meta.mimeType,
        checksumSha256: stored.checksumSha256,
      });

      await this.removeParts(uploadId);

      meta.status = "ready";
      meta.fileId = file.id;
      meta.completedAt = new Date().toISOString();
      delete meta.error;
      await this.writeMeta(uploadId, meta);
    } catch {
      await this.markFailed(uploadId, meta, "assemble_failed");
    }
  }

  async cleanupExpired(): Promise<number> {
    let entries: string[];
    try {
      entries = await readdir(this.uploadsRoot);
    } catch {
      return 0;
    }

    const now = Date.now();
    let removed = 0;

    for (const uploadId of entries) {
      try {
        const meta = await this.readMeta(uploadId);
        const createdAge = now - Date.parse(meta.createdAt);

        if (meta.status === "assembling" && createdAge < ASSEMBLING_GRACE_MS) continue;

        if (meta.status === "ready") {
          const doneAt = Date.parse(meta.completedAt ?? meta.createdAt);
          if (now - doneAt > READY_RETENTION_MS) {
            await rm(this.sessionDir(uploadId), { recursive: true, force: true });
            removed += 1;
          }
          continue;
        }

        if (createdAge > TTL_MS) {
          await rm(this.sessionDir(uploadId), { recursive: true, force: true });
          removed += 1;
        }
      } catch {
        // ignore corrupt dirs
      }
    }

    return removed;
  }

  startCleanupScheduler(log?: { info: (o: unknown, msg?: string) => void }): void {
    const run = () => {
      void this.cleanupExpired().then((n) => {
        if (n > 0) log?.info({ removed: n }, "cleaned expired chunked uploads");
      });
    };
    run();
    setInterval(run, 60 * 60 * 1000).unref?.();
  }
}
