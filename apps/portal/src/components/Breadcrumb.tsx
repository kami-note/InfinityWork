import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({ trail }: { trail: { id: string; name: string }[] }) {
  return (
    <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
      <Link href="/drive" className="rounded px-2 py-1 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900">
        Meus arquivos
      </Link>
      {trail.map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <ChevronRight size={14} />
          <Link
            href={`/drive?folderId=${item.id}`}
            className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {item.name}
          </Link>
        </span>
      ))}
    </div>
  );
}
