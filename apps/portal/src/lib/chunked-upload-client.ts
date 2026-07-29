import {
  DEFAULT_CHUNK_UPLOAD_SIZE_BYTES,
  DEFAULT_CHUNK_UPLOAD_THRESHOLD_BYTES,
  expectedChunkByteLength,
} from "@infinitywork/shared/chunked-upload";
import {
  clearResumeEntry,
  findResumeEntry,
  saveResumeEntry,
  type ChunkedUploadResumeEntry,
} from "@/lib/chunked-upload-resume";

export const CHUNK_UPLOAD_THRESHOLD_BYTES = Number(
  process.env.NEXT_PUBLIC_CHUNK_UPLOAD_THRESHOLD_BYTES ?? DEFAULT_CHUNK_UPLOAD_THRESHOLD_BYTES,
);

const CHUNK_SIZE = Number(
  process.env.NEXT_PUBLIC_CHUNK_UPLOAD_SIZE_BYTES ?? DEFAULT_CHUNK_UPLOAD_SIZE_BYTES,
);
const CONCURRENCY = 2;
const RETRIES = 3;
const POLL_MS = 1000;

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function errorMessageFromBody(status: number, body: unknown, fileSize?: number): string {
  if (body && typeof body === "object") {
    const err = body as { error?: string; message?: string };
    if (err.error === "upload_too_large") {
      return fileSize != null ? `Excede o limite (${formatUploadSize(fileSize)})` : "Excede o limite";
    }
    if (err.error === "missing_chunks") return "Partes faltando — tente de novo";
    if (err.error === "insufficient_storage") return "Espaço em disco insuficiente no servidor";
    if (err.error === "assemble_failed") return "Falha ao montar o arquivo";
    if (err.message) return err.message;
  }
  return `Erro ${status}`;
}

async function refreshSession(): Promise<void> {
  try {
    await fetch("/api/auth/refresh", { method: "POST" });
  } catch {
    // best-effort
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function xhrPut(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // keep null
      }
      reject(new Error(errorMessageFromBody(xhr.status, body)));
    };
    xhr.onerror = () => reject(new Error("Falha de rede"));
    xhr.send(blob);
  });
}

async function putChunkWithRetry(
  uploadId: string,
  index: number,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    await refreshSession();
    try {
      await xhrPut(`/api/files/uploads/${uploadId}/chunks/${index}`, blob, onProgress);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < RETRIES - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("Falha de rede");
}

async function mapPool(indexes: number[], worker: (index: number) => Promise<void>): Promise<void> {
  const queue = [...indexes];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const index = queue.shift()!;
        await worker(index);
      }
    }),
  );
}

function bytesForIndexes(
  indexes: Iterable<number>,
  fileSize: number,
  chunkSize: number,
  totalChunks: number,
): number {
  let sum = 0;
  for (const i of indexes) sum += expectedChunkByteLength(i, fileSize, chunkSize, totalChunks);
  return sum;
}

interface SessionInfo {
  uploadId: string;
  totalChunks: number;
  chunkSize: number;
  pendingIndexes: number[];
  /** Session already finished assembling — caller should only poll/mark done. */
  phase: "upload" | "assembling" | "ready";
}

async function initSession(file: File, folderId: string | null): Promise<SessionInfo> {
  const res = await fetch("/api/files/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      folderId,
      size: file.size,
    }),
  });
  if (!res.ok) {
    throw new Error(errorMessageFromBody(res.status, await parseJsonSafe(res), file.size));
  }
  const init = (await res.json()) as { uploadId: string; totalChunks: number; chunkSize: number };
  const entry: ChunkedUploadResumeEntry = {
    uploadId: init.uploadId,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    totalChunks: init.totalChunks,
    folderId,
  };
  saveResumeEntry(entry);
  return {
    uploadId: init.uploadId,
    totalChunks: init.totalChunks,
    chunkSize: init.chunkSize,
    pendingIndexes: Array.from({ length: init.totalChunks }, (_, i) => i),
    phase: "upload",
  };
}

async function resumeOrInit(file: File, folderId: string | null): Promise<SessionInfo> {
  const resume = findResumeEntry(file);
  if (!resume) return initSession(file, folderId);

  const res = await fetch(`/api/files/uploads/${resume.uploadId}`);
  if (!res.ok) {
    clearResumeEntry(file);
    return initSession(file, folderId);
  }

  const info = (await res.json()) as {
    status: string;
    totalChunks: number;
    chunkSize: number;
    receivedIndexes: number[];
  };

  if (info.status === "ready") {
    return {
      uploadId: resume.uploadId,
      totalChunks: info.totalChunks,
      chunkSize: info.chunkSize,
      pendingIndexes: [],
      phase: "ready",
    };
  }
  if (info.status === "assembling") {
    return {
      uploadId: resume.uploadId,
      totalChunks: info.totalChunks,
      chunkSize: info.chunkSize,
      pendingIndexes: [],
      phase: "assembling",
    };
  }
  if (info.status === "receiving") {
    const received = new Set(info.receivedIndexes ?? []);
    return {
      uploadId: resume.uploadId,
      totalChunks: info.totalChunks,
      chunkSize: info.chunkSize,
      pendingIndexes: Array.from({ length: info.totalChunks }, (_, i) => i).filter((i) => !received.has(i)),
      phase: "upload",
    };
  }

  clearResumeEntry(file);
  return initSession(file, folderId);
}

async function pollAssemble(uploadId: string): Promise<"ready" | "failed"> {
  for (;;) {
    await refreshSession();
    const res = await fetch(`/api/files/uploads/${uploadId}/status`);
    if (!res.ok) throw new Error(errorMessageFromBody(res.status, await parseJsonSafe(res)));
    const body = (await res.json()) as { status: string; error?: string };
    if (body.status === "ready") return "ready";
    if (body.status === "failed") {
      throw new Error(errorMessageFromBody(500, { error: body.error ?? "assemble_failed" }));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export interface ChunkedUploadHandlers {
  onProgress: (progress: number) => void;
  onUploadId: (uploadId: string) => void;
}

/** Single-request multipart upload (files below the chunk threshold). */
export function uploadFileSimple(
  file: File,
  folderId: string | null,
  handlers: { onProgress: (progress: number) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // Field order matters: @fastify/multipart resolves on the file part.
    if (folderId) form.append("folderId", folderId);
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) handlers.onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        handlers.onProgress(100);
        resolve();
        return;
      }
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // keep null
      }
      reject(new Error(errorMessageFromBody(xhr.status, body, file.size)));
    };
    xhr.onerror = () => reject(new Error("Falha de rede"));
    xhr.send(form);
  });
}

/** Chunked upload with resume via localStorage + server parts. */
export async function uploadFileChunked(
  file: File,
  folderId: string | null,
  handlers: ChunkedUploadHandlers,
): Promise<void> {
  await refreshSession();
  const session = await resumeOrInit(file, folderId);
  handlers.onUploadId(session.uploadId);

  if (session.phase === "ready") {
    handlers.onProgress(100);
    clearResumeEntry(file);
    return;
  }
  if (session.phase === "assembling") {
    handlers.onProgress(99);
    await pollAssemble(session.uploadId);
    clearResumeEntry(file);
    handlers.onProgress(100);
    return;
  }

  const { uploadId, totalChunks, chunkSize, pendingIndexes } = session;
  const completed = new Set(
    Array.from({ length: totalChunks }, (_, i) => i).filter((i) => !pendingIndexes.includes(i)),
  );
  const inFlight = new Map<number, number>();

  const report = () => {
    const confirmed = bytesForIndexes(completed, file.size, chunkSize, totalChunks);
    const flying = [...inFlight.values()].reduce((a, b) => a + b, 0);
    handlers.onProgress(Math.min(99, Math.round(((confirmed + flying) / file.size) * 100)));
  };
  report();

  await mapPool(pendingIndexes, async (index) => {
    const start = index * chunkSize;
    const blob = file.slice(start, Math.min(start + chunkSize, file.size));
    await putChunkWithRetry(uploadId, index, blob, (loaded) => {
      inFlight.set(index, loaded);
      report();
    });
    inFlight.delete(index);
    completed.add(index);
    report();
  });

  await refreshSession();
  const completeRes = await fetch(`/api/files/uploads/${uploadId}/complete`, { method: "POST" });
  if (!completeRes.ok) {
    throw new Error(errorMessageFromBody(completeRes.status, await parseJsonSafe(completeRes)));
  }

  handlers.onProgress(99);
  await pollAssemble(uploadId);
  clearResumeEntry(file);
  handlers.onProgress(100);
}
