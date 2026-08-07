/**
 * Caps a single HTTP Range response so open-ended requests like `bytes=0-`
 * cannot pull an entire multi-GB video through Node in one shot. Players
 * that support Range will request the next slice after this one.
 */
export const DEFAULT_MAX_RANGE_BYTES = 2 * 1024 * 1024;

export type ResolvedByteRange = {
  start: number;
  end: number;
};

/**
 * Parse `bytes=start-end` (either side optional) against a known total size.
 * Returns null for unsatisfiable ranges (caller should send 416).
 */
export function resolveByteRange(
  rangeHeader: string,
  totalSize: number,
  maxBytes: number = DEFAULT_MAX_RANGE_BYTES,
): ResolvedByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || totalSize <= 0) return null;

  const [, startStr, endStr] = match;
  let start = startStr ? parseInt(startStr, 10) : undefined;
  let end = endStr ? parseInt(endStr, 10) : undefined;

  if (start === undefined && end !== undefined) {
    // Suffix form: last N bytes
    start = Math.max(totalSize - end, 0);
    end = totalSize - 1;
  } else if (start !== undefined && end === undefined) {
    end = totalSize - 1;
  } else if (start === undefined || end === undefined) {
    return null;
  }

  if (start > end || start >= totalSize) return null;

  end = Math.min(end, totalSize - 1);

  // Cap slice length so one 206 never streams the whole object.
  if (end - start + 1 > maxBytes) {
    end = start + maxBytes - 1;
  }

  return { start, end };
}
