import Link from "next/link";
import { Play } from "lucide-react";
import { VideoThumbnail } from "./viewers/VideoThumbnail";
import { formatSize } from "@/lib/format";
import type { FileDto } from "@/lib/file-manager-client";

export function UpNextList({
  videos,
  hrefFor = (id) => `/view/${id}`,
  thumbnailSrcFor = (id) => `/api/files/${id}/download?disposition=inline`,
}: {
  videos: FileDto[];
  hrefFor?: (id: string) => string;
  thumbnailSrcFor?: (id: string) => string;
}) {
  if (videos.length === 0) return null;

  return (
    <div className="lg:w-80 lg:shrink-0">
      <h2 className="mb-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
        Próximos vídeos nesta pasta
      </h2>
      <div className="space-y-1">
        {videos.map((video) => (
          <Link
            key={video.id}
            href={hrefFor(video.id)}
            className="flex items-center gap-3 rounded p-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <span className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
              <VideoThumbnail src={thumbnailSrcFor(video.id)} className="h-full w-full object-cover" />
              <Play size={16} className="absolute text-white drop-shadow" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{video.name}</span>
              <span className="block text-xs text-neutral-500">{formatSize(video.size)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
