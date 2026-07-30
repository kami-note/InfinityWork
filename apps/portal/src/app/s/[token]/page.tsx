import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";
import Link from "next/link";

interface PublicFileMeta {
  targetType: "file";
  file: { id: string; name: string; size: string; mimeType: string; updatedAt: string };
}

interface PublicFolderMeta {
  targetType: "folder";
  folder: { id: string; name: string; updatedAt: string };
}

async function fetchMeta(token: string): Promise<PublicFileMeta | PublicFolderMeta | null> {
  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/public/links/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchChildren(token: string, parentId?: string) {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  const res = await fetch(
    `${FILE_MANAGER_SERVICE_URL}/public/links/${encodeURIComponent(token)}/children${qs}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json() as Promise<{
    folders: { id: string; name: string }[];
    files: { id: string; name: string; size: string; mimeType: string }[];
    breadcrumb: { id: string; name: string }[];
  }>;
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ folderId?: string }>;
}) {
  const { token } = await params;
  const { folderId } = await searchParams;
  const meta = await fetchMeta(token);

  if (!meta) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold">Link inválido ou expirado</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Este compartilhamento não está mais disponível.
        </p>
      </main>
    );
  }

  if (meta.targetType === "file") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <p className="text-sm text-neutral-500">Arquivo compartilhado</p>
        <h1 className="mt-1 text-2xl font-semibold break-all">{meta.file.name}</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {(Number(meta.file.size) / 1024).toFixed(1)} KB · {meta.file.mimeType}
        </p>
        <a
          href={`/api/share/${encodeURIComponent(token)}/download`}
          className="mt-6 inline-flex w-fit rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
        >
          Baixar
        </a>
      </main>
    );
  }

  const children = await fetchChildren(token, folderId);
  if (!children) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold">Não foi possível listar a pasta</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <p className="text-sm text-neutral-500">Pasta compartilhada</p>
      <h1 className="mt-1 text-2xl font-semibold">{meta.folder.name}</h1>

      {children.breadcrumb.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-1 text-sm text-neutral-600 dark:text-neutral-400">
          {children.breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <Link
                href={
                  crumb.id === meta.folder.id
                    ? `/s/${encodeURIComponent(token)}`
                    : `/s/${encodeURIComponent(token)}?folderId=${encodeURIComponent(crumb.id)}`
                }
                className="hover:underline"
              >
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {children.folders.map((folder) => (
          <li key={folder.id}>
            <Link
              href={`/s/${encodeURIComponent(token)}?folderId=${encodeURIComponent(folder.id)}`}
              className="block py-3 hover:underline"
            >
              {folder.name}/
            </Link>
          </li>
        ))}
        {children.files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0 truncate">{file.name}</span>
            <a
              href={`/api/share/${encodeURIComponent(token)}/files/${encodeURIComponent(file.id)}/download`}
              className="shrink-0 text-sm underline"
            >
              Baixar
            </a>
          </li>
        ))}
        {children.folders.length === 0 && children.files.length === 0 && (
          <li className="py-6 text-sm text-neutral-500">Pasta vazia.</li>
        )}
      </ul>
    </main>
  );
}
