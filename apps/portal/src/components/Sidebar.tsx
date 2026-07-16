import Link from "next/link";

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-6 text-lg font-semibold">InfinityWork</div>
      <nav className="space-y-1 text-sm">
        <Link href="/drive" className="block rounded px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          Meus arquivos
        </Link>
        <Link href="/trash" className="block rounded px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          Lixeira
        </Link>
      </nav>
    </aside>
  );
}
