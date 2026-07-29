"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { useUploadQueue } from "./UploadQueueProvider";
import { FileTypeIcon } from "@/lib/file-icon";

export function UploadProgressWidget() {
  const { uploads, dismiss, clearCompleted } = useUploadQueue();
  const [collapsed, setCollapsed] = useState(false);

  if (uploads.length === 0) return null;

  const uploading = uploads.filter((u) => u.status === "uploading").length;
  const queued = uploads.filter((u) => u.status === "queued").length;
  const done = uploads.filter((u) => u.status === "done").length;
  const failed = uploads.filter((u) => u.status === "error").length;
  const inFlight = uploading + queued;

  const headerLabel =
    inFlight > 0
      ? queued > 0
        ? `Enviando ${uploading} · ${queued} na fila`
        : `Enviando ${uploading} arquivo(s)`
      : failed > 0
        ? `${done} concluído(s), ${failed} com erro`
        : `${done} arquivo(s) enviado(s)`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-800">
        <span className="text-sm font-medium">{headerLabel}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={clearCompleted}
            disabled={inFlight > 0}
            title="Fechar"
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200 disabled:opacity-30 dark:hover:bg-neutral-700"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 last:border-b-0 dark:border-neutral-800"
            >
              <div className="shrink-0">
                {u.status === "uploading" && <Loader2 size={18} className="animate-spin text-blue-500" />}
                {u.status === "queued" && <Clock size={18} className="text-neutral-400" />}
                {u.status === "done" && <CheckCircle2 size={18} className="text-green-600" />}
                {u.status === "error" && <XCircle size={18} className="text-red-600" />}
              </div>
              <FileTypeIcon mimeType={u.mimeType} size={18} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{u.name}</div>
                {u.status === "uploading" && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${u.progress}%` }} />
                  </div>
                )}
                {u.status === "queued" && <div className="text-xs text-neutral-500">Na fila</div>}
                {u.status === "error" && <div className="text-xs text-red-600">{u.errorMessage}</div>}
              </div>
              {u.status !== "uploading" && (
                <button
                  onClick={() => dismiss(u.id)}
                  className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
