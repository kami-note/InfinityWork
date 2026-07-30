import Link from "next/link";
import { shareDownloadPath, sharePagePath, type PublicShareChildren } from "@/lib/public-share";

export function PublicFolderBrowser({
  token,
  folderId,
  folderName,
  children,
}: {
  token: string;
  folderId?: string;
  folderName: string;
  children: PublicShareChildren;
}) {
  const { folders, files, breadcrumb } = children;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <p className="text-sm text-neutral-500">Pasta compartilhada</p>
      <h1 className="mt-1 text-2xl font-semibold">{folderName}</h1>

      {breadcrumb.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-1 text-sm text-neutral-600 dark:text-neutral-400">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <Link
                href={i === 0 ? sharePagePath(token) : sharePagePath(token, { folderId: crumb.id })}
                className="hover:underline"
              >
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {folders.map((folder) => (
          <li key={folder.id}>
            <Link href={sharePagePath(token, { folderId: folder.id })} className="block py-3 hover:underline">
              {folder.name}/
            </Link>
          </li>
        ))}
        {files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-4 py-3">
            <Link
              href={sharePagePath(token, { folderId, view: file.id })}
              className="min-w-0 truncate hover:underline"
            >
              {file.name}
            </Link>
            <a
              href={shareDownloadPath(token, file.id)}
              className="shrink-0 text-sm text-neutral-600 underline dark:text-neutral-400"
            >
              Baixar
            </a>
          </li>
        ))}
        {folders.length === 0 && files.length === 0 && (
          <li className="py-6 text-sm text-neutral-500">Pasta vazia.</li>
        )}
      </ul>
    </main>
  );
}
