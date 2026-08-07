 "use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, MoreVertical } from "lucide-react";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";
import { FileTypeIcon, FolderIcon } from "@/lib/file-icon";
import { VideoThumbnail } from "./viewers/VideoThumbnail";
import { formatSize, formatDate } from "@/lib/format";
import type { DriveItem } from "./DriveItemTile";
import { useVirtualizer } from "@tanstack/react-virtual";

export type SortKey = "name" | "updatedAt" | "size";
export type SortDirection = "asc" | "desc";

const ROW_GRID = "grid-cols-[auto_1fr_40px] sm:grid-cols-[auto_1fr_110px_40px] md:grid-cols-[auto_1fr_140px_110px_40px]";

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-left text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ${className ?? ""}`}
    >
      {label}
      {active && (currentDirection === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );
}

export function DriveListView({
  items,
  selected,
  cutIds,
  onToggleSelect,
  onOpen,
  onMenu,
  onDragStart,
  onDropItems,
  sortKey,
  sortDirection,
  onSort,
}: {
  items: DriveItem[];
  selected: Set<string>;
  cutIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (item: DriveItem, e: React.MouseEvent) => void;
  onMenu: (x: number, y: number, item: DriveItem) => void;
  onDragStart: (item: DriveItem) => void;
  onDropItems: (targetFolderId: string) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement | null>(null);

  // Virtualizer uses the global scroll element so the list still flows with the page.
  const rowHeight = 48;
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => document.scrollingElement,
    estimateSize: () => rowHeight,
    overscan: 6,
  });
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className={`grid items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900 ${ROW_GRID}`}>
        <span className="w-5" />
        <SortableHeader label="Nome" sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={onSort} />
        <SortableHeader
          label="Modificado"
          sortKey="updatedAt"
          currentSort={sortKey}
          currentDirection={sortDirection}
          onSort={onSort}
          className="hidden md:flex"
        />
        <SortableHeader
          label="Tamanho"
          sortKey="size"
          currentSort={sortKey}
          currentDirection={sortDirection}
          onSort={onSort}
          className="hidden sm:flex"
        />
        <span />
      </div>

      <div ref={parentRef} className="relative">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            const isSelected = selected.has(item.id);
            const isImage = item.kind === "file" && item.mimeType.startsWith("image/");
            const isVideo = item.kind === "file" && item.mimeType.startsWith("video/");
            const isDocument = item.kind === "file" && item.mimeType === DOCUMENT_MIME_TYPE;
            const isDropTarget = item.kind === "folder";

            return (
              <div
                key={item.id}
                data-item-id={item.id}
                draggable
                onDragStart={() => onDragStart(item)}
                onDragOver={(e) => {
                  if (!isDropTarget) return;
                  e.preventDefault();
                  setDragOverId(item.id);
                }}
                onDragLeave={() => setDragOverId((id) => (id === item.id ? null : id))}
                onDrop={(e) => {
                  if (!isDropTarget) return;
                  e.preventDefault();
                  setDragOverId(null);
                  onDropItems(item.id);
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-select-checkbox]")) return;
                  onOpen(item, e);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu(e.clientX, e.clientY, item);
                }}
                className={`group grid cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 dark:border-neutral-900 ${ROW_GRID} ${
                  cutIds.has(item.id) ? "opacity-40" : ""
                } ${
                  dragOverId === item.id
                    ? "bg-blue-100 dark:bg-blue-900"
                    : isSelected
                      ? "bg-blue-50 dark:bg-blue-950"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }`}
                style={{ position: "absolute", top: v.start, left: 0, right: 0, height: v.size }}
              >
                <button
                  data-select-checkbox
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(item.id);
                  }}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    isSelected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-neutral-300 opacity-0 group-hover:opacity-100 dark:border-neutral-600"
                  }`}
                >
                  {isSelected && <span className="text-xs">✓</span>}
                </button>

                <div className="flex min-w-0 items-center gap-2">
                  {item.kind === "folder" ? (
                    <FolderIcon size={20} />
                  ) : isImage && item.thumbnailStatus === "ready" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- proxied through our own auth route
                    <img src={`/api/files/${item.id}/thumbnail`} alt="" loading="lazy" className="h-5 w-5 rounded object-cover" />
                  ) : isVideo ? (
                    <VideoThumbnail src={`/api/files/${item.id}/download?disposition=inline`} className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <FileTypeIcon mimeType={item.mimeType} size={20} />
                  )}
                  <span className="truncate">{item.name}</span>
                </div>

                <span className="hidden text-xs text-neutral-500 md:block">{formatDate(item.updatedAt)}</span>
                <span className="hidden text-xs text-neutral-500 sm:block">
                  {item.kind === "file" && !isDocument ? formatSize(item.size) : "—"}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onMenu(rect.left, rect.bottom, item);
                  }}
                  className="hidden rounded p-1 text-neutral-500 hover:bg-neutral-200 group-hover:block dark:hover:bg-neutral-800"
                >
                  <MoreVertical size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
