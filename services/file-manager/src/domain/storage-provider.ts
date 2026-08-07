import type { Readable } from "node:stream";

export interface StoredObject {
  storageKey: string;
  size: number;
  checksumSha256: string;
}

/**
 * Boundary between the domain and the physical storage backend. Today this
 * is implemented against the local filesystem (see LocalStorageProvider);
 * swapping to an S3-compatible backend later only means writing a new
 * implementation of this interface, no changes to callers.
 */
export interface ByteRange {
  start: number;
  end: number;
}

export interface StorageProvider {
  write(stream: Readable): Promise<StoredObject>;
  read(storageKey: string, range?: ByteRange): Readable;
  delete(storageKey: string): Promise<void>;
  /**
   * Create a new stored object by copying the bytes of an existing storageKey.
   * If `checksumSha256` is provided the provider SHOULD NOT recompute the hash
   * and may return the provided value directly. This enables callers to
   * avoid recomputing hashes when the domain already knows the checksum.
   */
  copyFrom(storageKey: string, checksumSha256?: string | null): Promise<StoredObject>;
  /**
   * Optional absolute filesystem path for tools that can seek on disk (e.g. ffmpeg).
   * S3-compatible backends leave this undefined; callers must fall back to `read()`.
   */
  localPath?(storageKey: string): string;
}
