"use client";

import { useRef, useState } from "react";
import { Loader2, FileQuestion, Download, Maximize2, Minimize2 } from "lucide-react";

type Status = "loading" | "ready" | "error";

function errorMessage(code: number | undefined): string {
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "Formato de vídeo não suportado neste navegador.";
  }
  if (code === MediaError.MEDIA_ERR_NETWORK) {
    return "Não foi possível carregar o vídeo.";
  }
  return "Não foi possível reproduzir este vídeo.";
}

export function VideoPlayer({
  url,
  name,
  theaterMode = false,
  onToggleTheater,
}: {
  url: string;
  name: string;
  theaterMode?: boolean;
  onToggleTheater?: () => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const downloadUrl = url.replace(/\?disposition=inline$/, "");

  return (
    <div
      className={`relative min-h-[240px] ${
        theaterMode ? "flex h-[75vh] w-full items-center justify-center bg-black" : "mx-auto max-w-full"
      }`}
    >
      <video
        ref={videoRef}
        controls
        preload="metadata"
        src={url}
        aria-label={name}
        className={`${theaterMode ? "h-full w-full object-contain" : "mx-auto max-h-[80vh] rounded"} ${
          status === "ready" ? "" : "invisible"
        }`}
        onLoadedMetadata={() => setStatus("ready")}
        onError={() => {
          setMessage(errorMessage(videoRef.current?.error?.code));
          setStatus("error");
        }}
      />

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-neutral-400" />
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded border border-dashed border-neutral-300 text-center dark:border-neutral-700">
          <FileQuestion size={40} className="text-neutral-400" />
          <p className="text-sm text-neutral-500">{message}</p>
          <a
            href={downloadUrl}
            className="flex items-center gap-2 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <Download size={14} />
            Baixar
          </a>
        </div>
      )}

      {status === "ready" && onToggleTheater && (
        <button
          onClick={onToggleTheater}
          title={theaterMode ? "Sair do modo teatro" : "Modo teatro"}
          className="absolute right-2 top-2 rounded bg-black/50 p-1.5 text-white hover:bg-black/70"
        >
          {theaterMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      )}
    </div>
  );
}
