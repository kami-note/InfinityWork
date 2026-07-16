"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renameFolderAction, deleteFolderAction, renameFileAction, deleteFileAction } from "@/lib/actions";

type Item =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string; size: string; mimeType: string };

function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ItemCard({ item }: { item: Item }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleRename() {
    const newName = prompt("Novo nome", item.name);
    if (!newName || newName === item.name) return;
    if (item.kind === "folder") await renameFolderAction(item.id, newName);
    else await renameFileAction(item.id, newName);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    if (item.kind === "folder") await deleteFolderAction(item.id);
    else await deleteFileAction(item.id);
    router.refresh();
  }

  const content = (
    <div className="group relative flex flex-col items-center rounded-lg border border-transparent p-4 text-center hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-800 dark:hover:bg-neutral-900">
      <div className="mb-2 text-4xl">{item.kind === "folder" ? "📁" : "📄"}</div>
      <div className="w-full truncate text-sm">{item.name}</div>
      {item.kind === "file" && (
        <div className="text-xs text-neutral-500">{formatSize(item.size)}</div>
      )}
      <button
        onClick={(e) => {
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
        className="absolute right-1 top-1 hidden rounded px-1.5 text-neutral-500 hover:bg-neutral-200 group-hover:block dark:hover:bg-neutral-800"
      >
        ⋮
      </button>
      {menuOpen && (
        <div
          onClick={(e) => e.preventDefault()}
          className="absolute right-1 top-8 z-10 w-36 rounded border border-neutral-200 bg-white py-1 text-left text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        >
          {item.kind === "file" && (
            <a
              href={`/api/files/${item.id}/download`}
              className="block px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Baixar
            </a>
          )}
          <button onClick={handleRename} className="block w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Renomear
          </button>
          <button onClick={handleDelete} className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Excluir
          </button>
        </div>
      )}
    </div>
  );

  if (item.kind === "folder") {
    return <Link href={`/drive?folderId=${item.id}`}>{content}</Link>;
  }
  return content;
}
