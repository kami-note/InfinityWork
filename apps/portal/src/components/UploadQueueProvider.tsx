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
  status: "queued" | "uploading" | "done" | "error";
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

interface QueuedJob {
  id: string;
  file: File;
  folderId: string | null;
  isLarge: boolean;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

/** Small files may share the pipe when no large file is running. */
const SMALL_FILE_CONCURRENCY = 3;

function isLargeFile(file: File): boolean {
  return file.size >= CHUNK_UPLOAD_THRESHOLD_BYTES;
}

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();
  const refreshScheduled = useRef(false);

  const pendingRef = useRef<QueuedJob[]>([]);
  const activeRef = useRef<Map<string, QueuedJob>>(new Map());
  /** Dismissed while uploading — stay in activeRef until the promise settles. */
  const cancelledRef = useRef<Set<string>>(new Set());
  const pumpingRef = useRef(false);

  function scheduleRefresh() {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    setTimeout(() => {
      refreshScheduled.current = false;
      router.refresh();
    }, 400);
  }

  function patchItem(id: string, patch: Partial<UploadItem>) {
    if (cancelledRef.current.has(id)) return;
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  function hasActiveLarge(): boolean {
    for (const job of activeRef.current.values()) {
      if (job.isLarge) return true;
    }
    return false;
  }

  function canStart(job: QueuedJob): boolean {
    const activeCount = activeRef.current.size;
    // Large file: exclusive — nothing else in flight.
    if (job.isLarge) return activeCount === 0;
    // Small files: never alongside a large; up to SMALL_FILE_CONCURRENCY together.
    if (hasActiveLarge()) return false;
    return activeCount < SMALL_FILE_CONCURRENCY;
  }

  function finishJob(id: string) {
    activeRef.current.delete(id);
    cancelledRef.current.delete(id);
    void pump();
  }

  function startJob(job: QueuedJob) {
    activeRef.current.set(job.id, job);
    patchItem(job.id, { status: "uploading", progress: 0 });

    const onProgress = (progress: number) => patchItem(job.id, { progress });

    const work = job.isLarge
      ? uploadFileChunked(job.file, job.folderId, {
          onProgress,
          onUploadId: (uploadId) => patchItem(job.id, { uploadId }),
        })
      : uploadFileSimple(job.file, job.folderId, { onProgress });

    void work
      .then(() => {
        if (cancelledRef.current.has(job.id)) return;
        patchItem(job.id, { progress: 100, status: "done" });
        scheduleRefresh();
      })
      .catch((err: unknown) => {
        if (cancelledRef.current.has(job.id)) return;
        patchItem(job.id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Falha de rede",
        });
      })
      .finally(() => finishJob(job.id));
  }

  function pump() {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        const next = pendingRef.current[0];
        if (!next || !canStart(next)) break;
        pendingRef.current.shift();
        startJob(next);
      }
    } finally {
      pumpingRef.current = false;
      // A finishJob may have landed while we held the pump lock.
      const head = pendingRef.current[0];
      if (head && canStart(head)) void pump();
    }
  }

  const enqueueUpload = useCallback((file: File, folderId: string | null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: QueuedJob = { id, file, folderId, isLarge: isLargeFile(file) };

    setUploads((prev) => [
      ...prev,
      {
        id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        progress: 0,
        status: "queued",
      },
    ]);

    pendingRef.current.push(job);
    void pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pump closes over refs
  }, []);

  const dismiss = useCallback((id: string) => {
    const wasPending = pendingRef.current.some((j) => j.id === id);
    pendingRef.current = pendingRef.current.filter((j) => j.id !== id);

    const wasActive = activeRef.current.has(id);
    if (wasActive) {
      // Keep the slot in activeRef until the in-flight promise settles, so a
      // large upload can't be "replaced" by the next job while bytes still move.
      cancelledRef.current.add(id);
    }

    setUploads((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item?.uploadId) {
        void fetch(`/api/files/uploads/${item.uploadId}`, { method: "DELETE" });
        clearResumeByUploadId(item.uploadId);
      }
      return prev.filter((u) => u.id !== id);
    });

    // Only re-pump immediately when we freed a queued slot (active dismiss
    // re-pumps from finishJob when the promise ends).
    if (wasPending && !wasActive) void pump();
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status === "uploading" || u.status === "queued"));
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
