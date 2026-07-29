import { FileQuestion, Download } from "lucide-react";
import { TextViewer } from "./viewers/TextViewer";
import { DocxViewer } from "./viewers/DocxViewer";
import { VideoTheaterLayout } from "./VideoTheaterLayout";
import { DOCX_MIME_TYPE, isTextLike } from "@/lib/viewer-types";
import type { FileDto } from "@/lib/file-manager-client";

export function FileViewer({
  file,
  upNext = [],
}: {
  file: { id: string; name: string; mimeType: string };
  upNext?: FileDto[];
}) {
  const downloadUrl = `/api/files/${file.id}/download`;
  // Content-Disposition: attachment (the default) forces a download dialog
  // instead of rendering — every embed below needs the inline variant.
  const inlineUrl = `${downloadUrl}?disposition=inline`;

  if (file.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- proxied through our own auth route
    return <img src={inlineUrl} alt={file.name} className="mx-auto max-h-[80vh] rounded" />;
  }

  if (file.mimeType === "application/pdf") {
    return <iframe src={inlineUrl} title={file.name} className="h-[85vh] w-full rounded border border-neutral-200 dark:border-neutral-800" />;
  }

  if (file.mimeType.startsWith("video/")) {
    return <VideoTheaterLayout url={inlineUrl} name={file.name} upNext={upNext} />;
  }

  if (file.mimeType.startsWith("audio/")) {
    return <audio controls src={inlineUrl} className="w-full" />;
  }

  if (file.mimeType === DOCX_MIME_TYPE) {
    return <DocxViewer url={inlineUrl} />;
  }

  if (isTextLike(file.mimeType, file.name)) {
    return <TextViewer url={inlineUrl} />;
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700">
      <FileQuestion size={40} className="text-neutral-400" />
      <p className="text-sm text-neutral-500">Pré-visualização não disponível para este tipo de arquivo.</p>
      <a
        href={downloadUrl}
        className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <Download size={14} />
        Baixar
      </a>
    </div>
  );
}
