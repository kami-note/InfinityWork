"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number; // 0-100
  status: "uploading" | "done" | "error";
  errorMessage?: string;
}

interface UploadQueueContextValue {
  uploads: UploadItem[];
  enqueueUpload: (file: File, folderId: string | null) => void;
  dismiss: (id: string) => void;
  clearCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();
  // router.refresh() re-fetches server data — batching it (rather than
  // firing once per finished file) avoids a refresh storm when several
  // uploads land within the same second.
  const refreshScheduled = useRef(false);

  function scheduleRefresh() {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    setTimeout(() => {
      refreshScheduled.current = false;
      router.refresh();
    }, 400);
  }

  const enqueueUpload = useCallback((file: File, folderId: string | null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, size: file.size, mimeType: file.type, progress: 0, status: "uploading" },
    ]);

    const form = new FormData();
    // Field order matters here: @fastify/multipart's request.file() resolves
    // as soon as it sees the file part and reads `data.fields` immediately,
    // before the rest of the stream (including any field placed after the
    // file) has been parsed. For anything but tiny/instant uploads, a
    // trailing folderId silently came through as undefined — the file
    // landed in root instead of the intended folder. Sending it first
    // guarantees busboy has already parsed it by the time file() resolves.
    if (folderId) form.append("folderId", folderId);
    form.append("file", file);

    // XMLHttpRequest, not fetch: fetch has no cross-browser way to observe
    // upload progress for a request body, XHR's upload.onprogress does.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const progress = Math.round((e.loaded / e.total) * 100);
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress } : u)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: 100, status: "done" } : u)));
      } else {
        let message = `Erro ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error === "upload_too_large") message = `Excede o limite (${formatSize(file.size)})`;
        } catch {
          // keep default message
        }
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error", errorMessage: message } : u)));
      }
      scheduleRefresh();
    };
    xhr.onerror = () => {
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "error", errorMessage: "Falha de rede" } : u)));
    };
    xhr.send(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable from next/navigation, scheduleRefresh closes over the ref not state
  }, []);

  const dismiss = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === "uploading"));
  }, []);

  return (
    <UploadQueueContext.Provider value={{ uploads, enqueueUpload, dismiss, clearCompleted }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used within UploadQueueProvider");
  return ctx;
}
