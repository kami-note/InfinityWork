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
}
