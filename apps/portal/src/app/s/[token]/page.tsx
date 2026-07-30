import Link from "next/link";
import type { ReactNode } from "react";
import { FileViewer } from "@/components/FileViewer";
import { FileViewShell } from "@/components/FileViewShell";
import { PublicFolderBrowser } from "@/components/PublicFolderBrowser";
import {
  fetchShareChildren,
  fetchShareFile,
  fetchShareMeta,
  shareDownloadPath,
  shareInlinePath,
  sharePagePath,
  siblingVideos,
} from "@/lib/public-share";

function ShareMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ folderId?: string; view?: string }>;
}) {
  const { token } = await params;
  const { folderId, view } = await searchParams;
  const meta = await fetchShareMeta(token);

  if (!meta) {
    return (
      <ShareMessage title="Link inválido ou expirado">
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Este compartilhamento não está mais disponível.
        </p>
      </ShareMessage>
    );
  }

  if (meta.targetType === "file") {
    return (
      <main className="min-h-screen">
        <FileViewShell
          title={meta.file.name}
          downloadUrl={shareDownloadPath(token)}
          eyebrow="Arquivo compartilhado"
          mimeType={meta.file.mimeType}
          size={meta.file.size}
        >
          <FileViewer file={meta.file} source={{ downloadUrl: shareDownloadPath(token) }} />
        </FileViewShell>
      </main>
    );
  }

  if (view) {
    const file = await fetchShareFile(token, view);
    if (!file) {
      return (
        <ShareMessage title="Arquivo não encontrado">
          <Link href={sharePagePath(token, { folderId })} className="mt-4 text-sm underline">
            Voltar à pasta
          </Link>
        </ShareMessage>
      );
    }

    const downloadUrl = shareDownloadPath(token, file.id);
    const backFolderId = folderId ?? file.folderId ?? undefined;
    let upNext = [] as ReturnType<typeof siblingVideos>;
    if (file.mimeType.startsWith("video/") && file.folderId) {
      const siblings = await fetchShareChildren(token, file.folderId);
      upNext = siblingVideos(siblings?.files ?? [], file.id);
    }

    return (
      <main className="min-h-screen">
        <FileViewShell
          title={file.name}
          downloadUrl={downloadUrl}
          backHref={sharePagePath(token, { folderId: backFolderId })}
          mimeType={file.mimeType}
          size={file.size}
        >
          <FileViewer
            file={file}
            source={{
              downloadUrl,
              upNext,
              upNextHrefFor: (id) => sharePagePath(token, { folderId: file.folderId, view: id }),
              upNextThumbnailSrcFor: (id) => shareInlinePath(token, id),
            }}
          />
        </FileViewShell>
      </main>
    );
  }

  const children = await fetchShareChildren(token, folderId);
  if (!children) {
    return <ShareMessage title="Não foi possível listar a pasta" />;
  }

  return (
    <PublicFolderBrowser
      token={token}
      folderId={folderId}
      folderName={meta.folder.name}
      children={children}
    />
  );
}
