"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { Trash2, List, LayoutGrid, ClipboardPaste } from "lucide-react";
import { DOCUMENT_MIME_TYPE } from "@infinitywork/shared";
import { DriveItemTile, type DriveItem } from "./DriveItemTile";
import { DriveListView, type SortKey, type SortDirection } from "./DriveListView";
import { DriveContextMenu, type ContextMenuState } from "./DriveContextMenu";
import { FilterChip } from "./FilterChip";
import {
  renameFolderAction,
  deleteFolderAction,
  renameFileAction,
  deleteFileAction,
  bulkDeleteAction,
  moveItemsAction,
  copyItemsAction,
} from "@/lib/actions";
import { ShareDialog } from "./ShareDialog";

type TypeFilter = "all" | "folder" | "document" | "image" | "other";
type ModifiedFilter = "all" | "today" | "week" | "month" | "year";
type ViewMode = "list" | "grid";
type ItemRef = { id: string; kind: "folder" | "file" };

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Tipo" },
  { value: "folder", label: "Pastas" },
  { value: "document", label: "Documentos" },
  { value: "image", label: "Imagens" },
  { value: "other", label: "Outros arquivos" },
];

const MODIFIED_OPTIONS: { value: ModifiedFilter; label: string }[] = [
  { value: "all", label: "Modificado" },
  { value: "today", label: "Hoje" },
  { value: "week", label: "Últimos 7 dias" },
  { value: "month", label: "Este mês" },
  { value: "year", label: "Este ano" },
];

function matchesType(item: DriveItem, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "folder") return item.kind === "folder";
  if (item.kind === "folder") return false;
  if (filter === "document") return item.mimeType === DOCUMENT_MIME_TYPE;
  if (filter === "image") return item.mimeType.startsWith("image/");
  return item.mimeType !== DOCUMENT_MIME_TYPE && !item.mimeType.startsWith("image/");
}

function matchesModified(item: DriveItem, filter: ModifiedFilter): boolean {
  if (filter === "all") return true;
  const days = { today: 1, week: 7, month: 30, year: 365 }[filter];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(item.updatedAt).getTime() >= cutoff;
}

/** True when the user is typing in a field — global shortcuts must not hijack normal text editing. */
function isTypingTarget(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function DriveGrid({
  items,
  emptyLabel,
  folderId = null,
}: {
  items: DriveItem[];
  emptyLabel: string;
  folderId?: string | null;
}) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [modifiedFilter, setModifiedFilter] = useState<ModifiedFilter>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ position: ContextMenuState; item: DriveItem } | null>(null);
  const [shareTarget, setShareTarget] = useState<DriveItem | null>(null);
  const [clipboard, setClipboard] = useState<{ items: ItemRef[]; mode: "copy" | "cut" } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const dragPayloadRef = useRef<ItemRef[]>([]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => matchesType(item, typeFilter) && matchesModified(item, modifiedFilter));
    const sorted = [...filtered].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "updatedAt") cmp = a.updatedAt.localeCompare(b.updatedAt);
      else if (sortKey === "size") cmp = Number(a.kind === "file" ? a.size : 0) - Number(b.kind === "file" ? b.size : 0);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [items, typeFilter, modifiedFilter, sortKey, sortDirection]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorRef.current = id;
  }

  function selectRange(targetId: string) {
    const anchor = anchorRef.current;
    if (!anchor) {
      toggleSelect(targetId);
      return;
    }
    const ids = visibleItems.map((i) => i.id);
    const from = ids.indexOf(anchor);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const [start, end] = from < to ? [from, to] : [to, from];
    setSelected(new Set(ids.slice(start, end + 1)));
  }

  function openItem(item: DriveItem) {
    if (item.kind === "folder") router.push(`/drive?folderId=${item.id}`);
    else if (item.mimeType === DOCUMENT_MIME_TYPE) router.push(`/docs/${item.id}`);
    else router.push(`/view/${item.id}`);
  }

  function handleItemClick(item: DriveItem, e: React.MouseEvent) {
    if (e.shiftKey) {
      e.preventDefault();
      selectRange(item.id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelect(item.id);
      return;
    }
    openItem(item);
  }

  async function handleRename(item: DriveItem) {
    const newName = prompt("Novo nome", item.name);
    if (!newName || newName === item.name) return;
    if (item.kind === "folder") await renameFolderAction(item.id, newName);
    else await renameFileAction(item.id, newName);
    router.refresh();
  }

  async function handleDelete(item: DriveItem) {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    if (item.kind === "folder") await deleteFolderAction(item.id);
    else await deleteFileAction(item.id);
    router.refresh();
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Excluir ${selected.size} item(ns) selecionado(s)?`)) return;
    const toDelete = items.filter((item) => selected.has(item.id)).map((item) => ({ id: item.id, kind: item.kind }));
    await bulkDeleteAction(toDelete);
    setSelected(new Set());
    router.refresh();
  }

  function copySelection(mode: "copy" | "cut") {
    if (selected.size === 0) return;
    const refs = items.filter((item) => selected.has(item.id)).map((item) => ({ id: item.id, kind: item.kind }));
    setClipboard({ items: refs, mode });
  }

  // Clipboard-aware paste that reads the latest clipboard from a ref so a
  // single global keydown listener can call it without stale closures.
  async function paste(targetFolderId: string | null) {
    const cb = clipboardRef.current;
    if (!cb || cb.items.length === 0) return;
    try {
      if (cb.mode === "copy") await copyItemsAction(cb.items, targetFolderId);
      else {
        await moveItemsAction(cb.items, targetFolderId);
        setClipboard(null);
      }
      router.refresh();
    } catch {
      alert("Não foi possível colar aqui (ex.: mover uma pasta para dentro dela mesma).");
    }
  }

  async function handleDrop(targetFolderId: string) {
    const payload = dragPayloadRef.current.filter((i) => i.id !== targetFolderId);
    if (payload.length === 0) return;
    try {
      await moveItemsAction(payload, targetFolderId);
      router.refresh();
    } catch {
      alert("Não foi possível mover para essa pasta.");
    }
  }

  function handleDragStart(item: DriveItem) {
    const refs = items.map((i) => ({ id: i.id, kind: i.kind }));
    dragPayloadRef.current = selected.has(item.id) && selected.size > 1 ? refs.filter((r) => selected.has(r.id)) : [{ id: item.id, kind: item.kind }];
  }

  // Global keyboard shortcuts: select all, invert, copy/cut/paste, delete, escape.
  // Use refs to avoid re-registering the listener every render while still
  // operating on up-to-date state.
  const selectedRef = useRef(selected);
  const visibleItemsRef = useRef(visibleItems);
  const clipboardRef = useRef(clipboard);
  const menuRef = useRef(menu);
  const folderIdRef = useRef(folderId);

  // keep refs in sync
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    visibleItemsRef.current = visibleItems;
  }, [visibleItems]);
  useEffect(() => {
    clipboardRef.current = clipboard;
  }, [clipboard]);
  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);
  useEffect(() => {
    folderIdRef.current = folderId;
  }, [folderId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget()) return;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(visibleItemsRef.current.map((i) => i.id)));
      } else if (meta && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setSelected(new Set(visibleItemsRef.current.filter((i) => !selectedRef.current.has(i.id)).map((i) => i.id)));
      } else if (meta && e.key.toLowerCase() === "c") {
        // create a clipboard snapshot from the latest visible items / selection
        const refs = visibleItemsRef.current.filter((i) => selectedRef.current.has(i.id)).map((i) => ({ id: i.id, kind: i.kind }));
        setClipboard({ items: refs, mode: "copy" });
      } else if (meta && e.key.toLowerCase() === "x") {
        const refs = visibleItemsRef.current.filter((i) => selectedRef.current.has(i.id)).map((i) => ({ id: i.id, kind: i.kind }));
        setClipboard({ items: refs, mode: "cut" });
      } else if (meta && e.key.toLowerCase() === "v") {
        void paste(folderIdRef.current);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current.size > 0) void handleBulkDelete();
      } else if (e.key === "Escape" && !menuRef.current) {
        setSelected(new Set());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Rubber-band marquee selection: mousedown on empty space starts a drag rectangle;
  // any item tile whose bounding box intersects it gets selected.
  function handleContainerMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-item-id], button, a, input, select")) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    const base = additive ? new Set(selected) : new Set<string>();
    if (!additive) setSelected(new Set());
    setMarqueeRect({ x1: startX, y1: startY, x2: startX, y2: startY });

    function onMove(ev: MouseEvent) {
      setMarqueeRect({ x1: startX, y1: startY, x2: ev.clientX, y2: ev.clientY });
      const left = Math.min(startX, ev.clientX);
      const right = Math.max(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const bottom = Math.max(startY, ev.clientY);
      const nodes = containerRef.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [];
      const hits = new Set(base);
      nodes.forEach((node) => {
        const r = node.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
          hits.add(node.dataset.itemId!);
        }
      });
      setSelected(hits);
    }
    function onUp() {
      setMarqueeRect(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Tipo" value={typeFilter} options={TYPE_OPTIONS} onChange={setTypeFilter} />
          <FilterChip label="Modificado" value={modifiedFilter} options={MODIFIED_OPTIONS} onChange={setModifiedFilter} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {clipboard && clipboard.items.length > 0 && (
            <button
              onClick={() => void paste(folderId)}
              className="flex items-center gap-1.5 rounded border border-blue-200 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950"
            >
              <ClipboardPaste size={14} />
              Colar {clipboard.items.length} item(ns)
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 rounded border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            >
              <Trash2 size={14} />
              Excluir {selected.size} selecionado(s)
            </button>
          )}
          <div className="flex overflow-hidden rounded border border-neutral-300 dark:border-neutral-700">
            <button
              onClick={() => setView("list")}
              className={`p-1.5 ${view === "list" ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-900"}`}
              title="Visualizar em lista"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 ${view === "grid" ? "bg-neutral-200 dark:bg-neutral-800" : "hover:bg-neutral-100 dark:hover:bg-neutral-900"}`}
              title="Visualizar em grade"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} onMouseDown={handleContainerMouseDown} className="relative select-none">
        {visibleItems.length === 0 ? (
          <p className="text-sm text-neutral-500">{emptyLabel}</p>
        ) : view === "list" ? (
          <DriveListView
            items={visibleItems}
            selected={selected}
            cutIds={clipboard?.mode === "cut" ? new Set(clipboard.items.map((i) => i.id)) : new Set()}
            onToggleSelect={toggleSelect}
            onOpen={handleItemClick}
            onMenu={(x, y, item) => setMenu({ position: { x, y }, item })}
            onDragStart={handleDragStart}
            onDropItems={handleDrop}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        ) : (
          // Virtualized grid view: calculate columns from container width to
          // match the Tailwind breakpoints used in the non-virtualized grid.
          <div ref={containerRef} className="relative">
            <GridVirtualized
              items={visibleItems}
              colsRef={containerRef}
              selected={selected}
              clipboard={clipboard}
              onToggleSelect={toggleSelect}
              onOpen={handleItemClick}
              onMenu={(x, y, item) => setMenu({ position: { x, y }, item })}
              onDragStart={handleDragStart}
              onDropItems={handleDrop}
            />
          </div>
        )}

        {marqueeRect && (
          <div
            className="pointer-events-none fixed z-40 border border-blue-500 bg-blue-500/10"
            style={{
              left: Math.min(marqueeRect.x1, marqueeRect.x2),
              top: Math.min(marqueeRect.y1, marqueeRect.y2),
              width: Math.abs(marqueeRect.x2 - marqueeRect.x1),
              height: Math.abs(marqueeRect.y2 - marqueeRect.y1),
            }}
          />
        )}
      </div>

      {menu && (
        <DriveContextMenu
          position={menu.position}
          onClose={() => setMenu(null)}
          actions={[
            ...(menu.item.kind === "file"
              ? [
                  {
                    label: menu.item.mimeType === DOCUMENT_MIME_TYPE ? "Baixar .docx" : "Baixar",
                    href:
                      menu.item.mimeType === DOCUMENT_MIME_TYPE
                        ? `/api/docs/${menu.item.id}/export`
                        : `/api/files/${menu.item.id}/download`,
                    onSelect: () => {},
                  },
                ]
              : []),
            {
              label: "Compartilhar",
              onSelect: () => setShareTarget(menu.item),
            },
            { label: "Copiar", onSelect: () => setClipboard({ items: [{ id: menu.item.id, kind: menu.item.kind }], mode: "copy" }) },
            { label: "Recortar", onSelect: () => setClipboard({ items: [{ id: menu.item.id, kind: menu.item.kind }], mode: "cut" }) },
            { label: "Renomear", onSelect: () => handleRename(menu.item) },
            { label: "Excluir", danger: true, onSelect: () => handleDelete(menu.item) },
          ]}
        />
      )}

      {shareTarget && (
        <ShareDialog
          kind={shareTarget.kind}
          id={shareTarget.id}
          name={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}

function GridVirtualized({
  items,
  colsRef,
  selected,
  clipboard,
  onToggleSelect,
  onOpen,
  onMenu,
  onDragStart,
  onDropItems,
}: {
  items: DriveItem[];
  colsRef: React.RefObject<HTMLElement | null>;
  selected: Set<string>;
  clipboard: { items: { id: string; kind: "file" | "folder" }[]; mode: "copy" | "cut" } | null;
  onToggleSelect: (id: string) => void;
  onOpen: (item: DriveItem, e: React.MouseEvent) => void;
  onMenu: (x: number, y: number, item: DriveItem) => void;
  onDragStart: (item: DriveItem) => void;
  onDropItems: (targetFolderId: string) => void;
}) {
  const rowHeight = 220; // estimated tile height including padding/gap
  const [cols, setCols] = useState(2);

  // determine columns based on container width to mirror Tailwind breakpoints:
  // base: 2, sm (>=640):4, md (>=768):6
  useEffect(() => {
    function update() {
      const width = colsRef.current?.clientWidth ?? window.innerWidth;
      if (width >= 768) setCols(6);
      else if (width >= 640) setCols(4);
      else setCols(2);
    }
    update();
    const ro = new ResizeObserver(update);
    if (colsRef.current) ro.observe(colsRef.current);
    else ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [colsRef]);

  const rowCount = Math.max(1, Math.ceil(items.length / cols));

  const virtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    getScrollElement: () => document.scrollingElement,
    overscan: 4,
  });

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((v) => {
        const rowIndex = v.index;
        const start = rowIndex * cols;
        const rowItems = items.slice(start, start + cols);
        return (
          <div
            key={rowIndex}
            style={{ position: "absolute", top: v.start, left: 0, right: 0, height: v.size }}
            className="flex gap-2 px-0"
          >
            {Array.from({ length: cols }).map((_, ci) => {
              const idx = start + ci;
              const item = items[idx];
              return item ? (
                <div key={item.id} style={{ width: `${100 / cols}%` }}>
                  <DriveItemTile
                    item={item}
                    selected={selected.has(item.id)}
                    cut={clipboard?.mode === "cut" && clipboard.items.some((i) => i.id === item.id)}
                    onToggleSelect={() => onToggleSelect(item.id)}
                    onOpen={(e) => onOpen(item, e)}
                    onMenu={(x, y) => onMenu(x, y, item)}
                    onDragStart={() => onDragStart(item)}
                    onDropItems={() => onDropItems(item.id)}
                  />
                </div>
              ) : (
                <div key={`empty-${ci}`} style={{ width: `${100 / cols}%` }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
