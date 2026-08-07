"use client";

import { useState } from "react";
import { MoreVertical, Check } from "lucide-react";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";
import { FileTypeIcon, FolderIcon } from "@/lib/file-icon";
import { VideoThumbnail } from "./viewers/VideoThumbnail";
import { formatSize } from "@/lib/format";

export type DriveItem =
  | { kind: "folder"; id: string; name: string; updatedAt: string }
  | {
      kind: "file";
      id: string;
      name: string;
      size: string;
      mimeType: string;
      updatedAt: string;
      // Optional thumbnail pipeline status (may be undefined for older API responses).
      thumbnailStatus?: "none" | "pending" | "ready" | "failed";
    };

export function DriveItemTile({
  item,
  selected,
  cut,
  onToggleSelect,
  onOpen,
  onMenu,
  onDragStart,
  onDropItems,
}: {
  item: DriveItem;
  selected: boolean;
  cut: boolean;
  onToggleSelect: () => void;
  onOpen: (e: React.MouseEvent) => void;
  onMenu: (x: number, y: number) => void;
  onDragStart: () => void;
  onDropItems: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isImage = item.kind === "file" && item.mimeType.startsWith("image/");
  const isVideo = item.kind === "file" && item.mimeType.startsWith("video/");
  const isDocument = item.kind === "file" && item.mimeType === DOCUMENT_MIME_TYPE;
  const isDropTarget = item.kind === "folder";

  return (
    <div
      data-item-id={item.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        if (!isDropTarget) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!isDropTarget) return;
        e.preventDefault();
        setDragOver(false);
        onDropItems();
      }}
      onClick={(e) => {
        // Clicking the checkbox area shouldn't also navigate/open the item.
        if ((e.target as HTMLElement).closest("[data-select-checkbox]")) return;
        onOpen(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      className={`group relative flex cursor-pointer flex-col items-center rounded-lg border p-4 text-center ${cut ? "opacity-40" : ""} ${
        dragOver
          ? "border-blue-500 bg-blue-100 dark:bg-blue-900"
          : selected
            ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950"
            : "border-transparent hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-neutral-900"
      }`}
    >
      <button
        data-select-checkbox
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border ${
          selected
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-neutral-300 bg-white opacity-0 group-hover:opacity-100 dark:border-neutral-600 dark:bg-neutral-900"
        }`}
      >
        {selected && <Check size={14} />}
      </button>

      <div className="mb-2 flex h-16 w-16 items-center justify-center">
        {item.kind === "folder" ? (
          <FolderIcon size={48} />
        ) : isImage && item.thumbnailStatus === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- proxied through our own auth route, not a static asset Next can optimize
          <img src={`/api/files/${item.id}/thumbnail`} alt={item.name} loading="lazy" className="h-16 w-16 rounded object-cover" />
        ) : isVideo ? (
          <VideoThumbnail
            src={`/api/files/${item.id}/download?disposition=inline`}
            className="h-16 w-16 rounded object-cover"
          />
        ) : (
          <FileTypeIcon mimeType={item.mimeType} size={48} />
        )}
      </div>

      <div className="w-full truncate text-sm">{item.name}</div>
      {item.kind === "file" && !isDocument && (
        <div className="text-xs text-neutral-500">{formatSize(item.size)}</div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onMenu(rect.left, rect.bottom);
        }}
        className="absolute right-1 top-1 hidden rounded p-1 text-neutral-500 hover:bg-neutral-200 group-hover:block dark:hover:bg-neutral-800"
      >
        <MoreVertical size={16} />
      </button>
    </div>
  );
}
