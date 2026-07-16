"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderPlus, FilePlus } from "lucide-react";
import { createFolderAction, createDocumentAction } from "@/lib/actions";

export function NewButton({ parentId }: { parentId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleNewFolder() {
    setOpen(false);
    const name = prompt("Nome da pasta");
    if (!name?.trim()) return;
    setBusy(true);
    await createFolderAction(name.trim(), parentId);
    setBusy(false);
    router.refresh();
  }

  async function handleNewDocument() {
    setOpen(false);
    setBusy(true);
    const file = await createDocumentAction("Documento sem título", parentId);
    setBusy(false);
    router.push(`/docs/${file.id}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium shadow-sm hover:shadow disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <Plus size={18} />
        Novo
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          <button
            onClick={handleNewFolder}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <FolderPlus size={16} />
            Nova pasta
          </button>
          <button
            onClick={handleNewDocument}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <FilePlus size={16} />
            Novo documento
          </button>
        </div>
      )}
    </div>
  );
}
