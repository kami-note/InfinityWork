"use client";

import { useState } from "react";
import { createFolderAction } from "@/lib/actions";

export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    await createFolderAction(name.trim(), parentId);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        + Nova pasta
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Nome da pasta"
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button onClick={handleCreate} className="text-sm text-blue-600">Criar</button>
      <button onClick={() => setOpen(false)} className="text-sm text-neutral-500">Cancelar</button>
    </div>
  );
}
