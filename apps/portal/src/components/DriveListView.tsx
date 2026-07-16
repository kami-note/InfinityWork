"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, MoreVertical } from "lucide-react";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";
import { FileTypeIcon, FolderIcon } from "@/lib/file-icon";
import { formatSize, formatDate } from "@/lib/format";
import type { DriveItem } from "./DriveItemTile";

export type SortKey = "name" | "updatedAt" | "size";
export type SortDirection = "asc" | "desc";

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

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <div className="grid grid-cols-[auto_1fr_140px_110px_40px] items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="w-5" />
        <SortableHeader label="Nome" sortKey="name" currentSort={sortKey} currentDirection={sortDirection} onSort={onSort} />
        <SortableHeader label="Modificado" sortKey="updatedAt" currentSort={sortKey} currentDirection={sortDirection} onSort={onSort} />
        <SortableHeader label="Tamanho" sortKey="size" currentSort={sortKey} currentDirection={sortDirection} onSort={onSort} />
        <span />
      </div>

      {items.map((item) => {
        const isSelected = selected.has(item.id);
        const isImage = item.kind === "file" && item.mimeType.startsWith("image/");
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
            className={`group grid cursor-pointer grid-cols-[auto_1fr_140px_110px_40px] items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm last:border-b-0 dark:border-neutral-900 ${
              cutIds.has(item.id) ? "opacity-40" : ""
            } ${
              dragOverId === item.id
                ? "bg-blue-100 dark:bg-blue-900"
                : isSelected
                  ? "bg-blue-50 dark:bg-blue-950"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-900"
            }`}
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
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- proxied through our own auth route
                <img src={`/api/files/${item.id}/download`} alt="" loading="lazy" className="h-5 w-5 rounded object-cover" />
              ) : (
                <FileTypeIcon mimeType={item.mimeType} size={20} />
              )}
              <span className="truncate">{item.name}</span>
            </div>

            <span className="text-xs text-neutral-500">{formatDate(item.updatedAt)}</span>
            <span className="text-xs text-neutral-500">
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
  );
}
