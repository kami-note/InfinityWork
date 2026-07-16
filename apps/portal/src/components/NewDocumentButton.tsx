"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDocumentAction } from "@/lib/actions";

export function NewDocumentButton({ parentId }: { parentId: string | null }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleClick() {
    setCreating(true);
    const file = await createDocumentAction("Documento sem título", parentId);
    router.push(`/docs/${file.id}`);
  }

  return (
    <button
      onClick={handleClick}
      disabled={creating}
      className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
    >
      {creating ? "Criando..." : "+ Novo documento"}
    </button>
  );
}
