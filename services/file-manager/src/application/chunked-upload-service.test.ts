import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, it, before, after } from "node:test";
import { LocalStorageProvider } from "../infrastructure/local-storage-provider.js";
import { ChunkedUploadError, ChunkedUploadService } from "./chunked-upload-service.js";

const CHUNK = 64 * 1024; // 64 KiB for tests

async function putAll(
  service: ChunkedUploadService,
  uploadId: string,
  ownerId: string,
  buf: Buffer,
  totalChunks: number,
) {
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK;
    const end = Math.min(start + CHUNK, buf.length);
    const slice = buf.subarray(start, end);
    await service.putChunk(uploadId, ownerId, i, slice.length, Readable.from(slice));
  }
}

async function waitStatus(
  service: ChunkedUploadService,
  uploadId: string,
  ownerId: string,
  want: "ready" | "failed",
) {
  for (let i = 0; i < 50; i++) {
    const status = await service.getStatus(uploadId, ownerId);
    if (status.status === want) return status;
    if (status.status === "failed" && want === "ready") {
      assert.fail(`assemble failed: ${status.error}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail(`timed out waiting for ${want}`);
}

describe("ChunkedUploadService", () => {
  let root: string;
  let service: ChunkedUploadService;
  let files: { id: string; name: string; size: number }[];

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "iw-chunked-"));
    const storage = new LocalStorageProvider(root, 10 * 1024 * 1024);
    files = [];
    service = new ChunkedUploadService(root, storage, {
      chunkSize: CHUNK,
      maxRequestBytes: CHUNK,
      maxUploadBytes: 10 * 1024 * 1024,
      persistFile: async (data) => {
        const id = `file-${files.length + 1}`;
        files.push({ id, name: data.name, size: data.size });
        return { id };
      },
      findFile: async (id) => files.find((f) => f.id === id) ?? null,
      freeBytes: async () => 50 * 1024 * 1024,
    });
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("happy path: init → chunks → complete → ready", async () => {
    const ownerId = "user-1";
    const buf = Buffer.alloc(CHUNK * 2 + 100, 7);
    const { uploadId, totalChunks } = await service.createSession({
      ownerId,
      name: "video.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size: buf.length,
    });
    assert.equal(totalChunks, 3);
    await putAll(service, uploadId, ownerId, buf, totalChunks);
    await service.requestComplete(uploadId, ownerId);
    const status = await waitStatus(service, uploadId, ownerId, "ready");
    assert.ok(status.file);
    assert.equal((status.file as { size: number }).size, buf.length);
  });

  it("rejects wrong Content-Length", async () => {
    const ownerId = "user-2";
    const size = CHUNK + 10;
    const { uploadId } = await service.createSession({
      ownerId,
      name: "bad.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size,
    });
    await assert.rejects(
      () => service.putChunk(uploadId, ownerId, 0, CHUNK - 1, Readable.from(Buffer.alloc(CHUNK - 1))),
      (err: unknown) => err instanceof ChunkedUploadError && err.code === "invalid",
    );
  });

  it("rejects complete with missing chunks", async () => {
    const ownerId = "user-3";
    const buf = Buffer.alloc(CHUNK * 2, 1);
    const { uploadId, totalChunks } = await service.createSession({
      ownerId,
      name: "partial.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size: buf.length,
    });
    const slice = buf.subarray(0, CHUNK);
    await service.putChunk(uploadId, ownerId, 0, slice.length, Readable.from(slice));
    const { receivedIndexes } = await service.listReceivedParts(uploadId, ownerId);
    assert.deepEqual(receivedIndexes, [0]);
    assert.equal(totalChunks, 2);
    await assert.rejects(
      () => service.requestComplete(uploadId, ownerId),
      (err: unknown) => err instanceof ChunkedUploadError && err.code === "missing_chunks",
    );
  });

  it("rejects other owner", async () => {
    const { uploadId } = await service.createSession({
      ownerId: "owner",
      name: "x.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size: 10,
    });
    await assert.rejects(
      () => service.listReceivedParts(uploadId, "intruder"),
      (err: unknown) => err instanceof ChunkedUploadError && err.code === "forbidden",
    );
  });

  it("fails assemble when disk is insufficient", async () => {
    const storage = new LocalStorageProvider(root, 10 * 1024 * 1024);
    const tight = new ChunkedUploadService(root, storage, {
      chunkSize: CHUNK,
      maxRequestBytes: CHUNK,
      maxUploadBytes: 10 * 1024 * 1024,
      persistFile: async () => ({ id: "should-not" }),
      findFile: async () => null,
      freeBytes: async () => 0,
    });
    const ownerId = "user-disk";
    const buf = Buffer.alloc(CHUNK + 1, 2);
    const { uploadId, totalChunks } = await tight.createSession({
      ownerId,
      name: "big.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size: buf.length,
    });
    await putAll(tight, uploadId, ownerId, buf, totalChunks);
    await tight.requestComplete(uploadId, ownerId);
    const status = await waitStatus(tight, uploadId, ownerId, "failed");
    assert.equal(status.error, "insufficient_storage");
  });

  it("resume lists partial parts", async () => {
    const ownerId = "user-resume";
    const buf = Buffer.alloc(CHUNK * 3, 9);
    const { uploadId, totalChunks } = await service.createSession({
      ownerId,
      name: "resume.bin",
      mimeType: "application/octet-stream",
      folderId: null,
      size: buf.length,
    });
    const slice = buf.subarray(CHUNK, CHUNK * 2);
    await service.putChunk(uploadId, ownerId, 1, slice.length, Readable.from(slice));
    const { receivedIndexes } = await service.listReceivedParts(uploadId, ownerId);
    assert.deepEqual(receivedIndexes, [1]);
    assert.equal(totalChunks, 3);
  });
});
