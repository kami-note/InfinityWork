"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearResumeByUploadId } from "@/lib/chunked-upload-resume";
import {
  CHUNK_UPLOAD_THRESHOLD_BYTES,
  uploadFileChunked,
  uploadFileSimple,
} from "@/lib/chunked-upload-client";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number; // 0-100
  status: "uploading" | "done" | "error";
  errorMessage?: string;
  /** Server chunked-upload session id, when using the chunked path. */
  uploadId?: string;
}

interface UploadQueueContextValue {
  uploads: UploadItem[];
  enqueueUpload: (file: File, folderId: string | null) => void;
  dismiss: (id: string) => void;
  clearCompleted: () => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();
  const refreshScheduled = useRef(false);

  function scheduleRefresh() {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    setTimeout(() => {
      refreshScheduled.current = false;
      router.refresh();
    }, 400);
  }

  function patchItem(id: string, patch: Partial<UploadItem>) {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  const enqueueUpload = useCallback((file: File, folderId: string | null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setUploads((prev) => [
      ...prev,
      { id, name: file.name, size: file.size, mimeType: file.type, progress: 0, status: "uploading" },
    ]);

    const onProgress = (progress: number) => patchItem(id, { progress });

    const work =
      file.size >= CHUNK_UPLOAD_THRESHOLD_BYTES
        ? uploadFileChunked(file, folderId, {
            onProgress,
            onUploadId: (uploadId) => patchItem(id, { uploadId }),
          })
        : uploadFileSimple(file, folderId, { onProgress });

    void work
      .then(() => {
        patchItem(id, { progress: 100, status: "done" });
        scheduleRefresh();
      })
      .catch((err: unknown) => {
        // Keep server session + localStorage on network errors so the same
        // file can be re-selected and resumed.
        patchItem(id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Falha de rede",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleRefresh closes over a ref
  }, []);

  const dismiss = useCallback((id: string) => {
    setUploads((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item?.uploadId && item.status === "uploading") {
        void fetch(`/api/files/uploads/${item.uploadId}`, { method: "DELETE" });
        clearResumeByUploadId(item.uploadId);
      }
      return prev.filter((u) => u.id !== id);
    });
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
