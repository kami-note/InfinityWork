/** Defaults shared by file-manager and the portal upload queue. */

export const DEFAULT_CHUNK_UPLOAD_SIZE_BYTES = 80 * 1024 * 1024;
export const DEFAULT_CHUNK_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;
/** Hard cap per PUT — stay under Cloudflare's ~100MB request body limit. */
export const DEFAULT_CHUNK_UPLOAD_MAX_REQUEST_BYTES = 90 * 1024 * 1024;

export function expectedChunkByteLength(
  index: number,
  totalSize: number,
  chunkSize: number,
  totalChunks: number,
): number {
  if (index < 0 || index >= totalChunks) {
    throw new RangeError(`chunk index ${index} out of range 0..${totalChunks - 1}`);
  }
  if (index === totalChunks - 1) {
    return totalSize - chunkSize * (totalChunks - 1);
  }
  return chunkSize;
}

export function totalChunksForSize(totalSize: number, chunkSize: number): number {
  if (totalSize <= 0) return 0;
  return Math.ceil(totalSize / chunkSize);
}
