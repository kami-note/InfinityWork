import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { Readable } from "node:stream";
import sharp from "sharp";
import { prisma } from "../infrastructure/prisma.js";
import { enqueueThumbnailGeneration, thumbnailQueue } from "./thumbnail-service.js";
import type { StorageProvider, StoredObject } from "../domain/storage-provider.js";

const runDbTests = process.env.RUN_DB_TESTS === "1";

class MockStorageProvider implements StorageProvider {
  files = new Map<string, Buffer>();

  async write(stream: Readable): Promise<StoredObject> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const storageKey = `test-${Math.random()}`;
    this.files.set(storageKey, buffer);
    return {
      storageKey,
      size: buffer.length,
      checksumSha256: "fake-checksum",
    };
  }

  read(storageKey: string): Readable {
    const buffer = this.files.get(storageKey);
    if (!buffer) throw new Error("Not found");
    return Readable.from(buffer);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async copyFrom(storageKey: string, checksumSha256: string | null = null): Promise<StoredObject> {
    const buffer = this.files.get(storageKey);
    if (!buffer) throw new Error("Not found");
    const newKey = `test-${Math.random()}`;
    this.files.set(newKey, buffer);
    return {
      storageKey: newKey,
      size: buffer.length,
      checksumSha256: checksumSha256 ?? "fake-checksum",
    };
  }
}

describe("ThumbnailService", { skip: !runDbTests }, () => {
  const storage = new MockStorageProvider();
  const ownerId = "test-user-thumbnail";
  let imageFileId: string;
  let nonImageFileId: string;
  let corruptedFileId: string;

  before(async () => {
    // Create a valid image
    const validImage = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).jpeg().toBuffer();
    const storedImage = await storage.write(Readable.from(validImage));
    
    const imgFile = await prisma.file.create({
      data: {
        name: "test.jpg",
        ownerId,
        storageKey: storedImage.storageKey,
        size: BigInt(storedImage.size),
        mimeType: "image/jpeg",
        checksumSha256: storedImage.checksumSha256,
      }
    });
    imageFileId = imgFile.id;

    // Create a non-image file
    const textData = Buffer.from("hello world");
    const storedText = await storage.write(Readable.from(textData));
    const txtFile = await prisma.file.create({
      data: {
        name: "test.txt",
        ownerId,
        storageKey: storedText.storageKey,
        size: BigInt(storedText.size),
        mimeType: "text/plain",
        checksumSha256: storedText.checksumSha256,
      }
    });
    nonImageFileId = txtFile.id;

    // Create a corrupted image file (actually just random bytes)
    const corruptedData = Buffer.from("not an image");
    const storedCorrupted = await storage.write(Readable.from(corruptedData));
    const badFile = await prisma.file.create({
      data: {
        name: "corrupted.jpg",
        ownerId,
        storageKey: storedCorrupted.storageKey,
        size: BigInt(storedCorrupted.size),
        mimeType: "image/jpeg",
        checksumSha256: storedCorrupted.checksumSha256,
      }
    });
    corruptedFileId = badFile.id;
  });

  after(async () => {
    await prisma.file.deleteMany({ where: { ownerId } });
    await prisma.$disconnect();
  });

  it("should generate a thumbnail for a valid image", async () => {
    await enqueueThumbnailGeneration(storage, imageFileId);
    
    // Wait for the queue to process
    await thumbnailQueue.onIdle();

    const file = await prisma.file.findUnique({ where: { id: imageFileId } });
    assert.equal(file?.thumbnailStatus, "ready");
    assert.ok(file?.thumbnailStorageKey);
    
    const thumbnailData = storage.files.get(file!.thumbnailStorageKey!);
    assert.ok(thumbnailData);
    
    // Verify it's a valid image and resized
    const metadata = await sharp(thumbnailData).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.ok(metadata.width! <= 256);
    assert.ok(metadata.height! <= 256);
  });

  it("should not trigger generation for non-thumbnailable files", async () => {
    await enqueueThumbnailGeneration(storage, nonImageFileId);
    await thumbnailQueue.onIdle();

    const file = await prisma.file.findUnique({ where: { id: nonImageFileId } });
    assert.equal(file?.thumbnailStatus, "none");
    assert.equal(file?.thumbnailStorageKey, null);
  });

  it("should mark status as failed for corrupted images", async () => {
    await enqueueThumbnailGeneration(storage, corruptedFileId);
    await thumbnailQueue.onIdle();

    const file = await prisma.file.findUnique({ where: { id: corruptedFileId } });
    assert.equal(file?.thumbnailStatus, "failed");
    assert.equal(file?.thumbnailStorageKey, null);
  });
});
