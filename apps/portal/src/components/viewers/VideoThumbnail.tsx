"use client";

/**
 * Lightweight, fully client-side thumbnail: seeks a hidden-controls <video>
 * to 1s in and lets the browser render that frame — no server-side
 * transcoding/frame-extraction, consistent with this project's
 * low-computational-cost constraint (see CLAUDE.md). `preload="metadata"`
 * keeps the fetch small; it rides the same Range-backed download URL as
 * the full player.
 */
export function VideoThumbnail({ src, className }: { src: string; className?: string }) {
  return (
    <video
      src={src}
      muted
      playsInline
      preload="metadata"
      className={className}
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        video.currentTime = Math.min(1, video.duration / 2 || 0);
      }}
    />
  );
}
