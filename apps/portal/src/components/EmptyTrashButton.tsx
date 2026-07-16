"use client";

import { useRouter } from "next/navigation";
import { emptyTrashAction } from "@/lib/actions";

export function EmptyTrashButton() {
  const router = useRouter();

  async function handleClick() {
    if (!confirm("Esvaziar a lixeira? Esta ação não pode ser desfeita.")) return;
    await emptyTrashAction();
    router.refresh();
  }

  return (
    <button onClick={handleClick} className="text-sm text-red-600 hover:underline">
      Esvaziar lixeira
    </button>
  );
}
