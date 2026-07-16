import { Suspense } from "react";
import Link from "next/link";
import { HardDrive, Trash2 } from "lucide-react";
import { NewButton } from "./NewButton";
import { StorageUsage } from "./StorageUsage";

export function Sidebar({ parentId = null }: { parentId?: string | null }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <div className="mb-6 text-lg font-semibold">InfinityWork</div>
        <div className="mb-4">
          <NewButton parentId={parentId} />
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/drive"
            className="flex items-center gap-3 rounded-full px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <HardDrive size={18} />
            Meus arquivos
          </Link>
          <Link
            href="/trash"
            className="flex items-center gap-3 rounded-full px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <Trash2 size={18} />
            Lixeira
          </Link>
        </nav>
      </div>
      <Suspense fallback={null}>
        <StorageUsage />
      </Suspense>
    </aside>
  );
}
