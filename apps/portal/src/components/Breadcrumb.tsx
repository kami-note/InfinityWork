import Link from "next/link";

export function Breadcrumb({ trail }: { trail: { id: string; name: string }[] }) {
  return (
    <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
      <Link href="/drive" className="hover:underline">Meus arquivos</Link>
      {trail.map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <span>/</span>
          <Link href={`/drive?folderId=${item.id}`} className="hover:underline">
            {item.name}
          </Link>
        </span>
      ))}
    </div>
  );
}
