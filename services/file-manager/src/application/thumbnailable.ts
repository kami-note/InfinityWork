/** Mime types that get a server-side JPEG thumbnail (images via sharp, videos via ffmpeg). */
export function isThumbnailableMime(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}
