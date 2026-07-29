const STORAGE_KEY = "iw-chunked-uploads";

export interface ChunkedUploadResumeEntry {
  uploadId: string;
  name: string;
  size: number;
  lastModified: number;
  totalChunks: number;
  folderId: string | null;
}

function readAll(): ChunkedUploadResumeEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChunkedUploadResumeEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ChunkedUploadResumeEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function fileResumeKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function findResumeEntry(file: File): ChunkedUploadResumeEntry | null {
  const match = readAll().find(
    (e) => e.name === file.name && e.size === file.size && e.lastModified === file.lastModified,
  );
  return match ?? null;
}

export function saveResumeEntry(entry: ChunkedUploadResumeEntry): void {
  const rest = readAll().filter(
    (e) => !(e.name === entry.name && e.size === entry.size && e.lastModified === entry.lastModified),
  );
  writeAll([...rest, entry]);
}

export function clearResumeEntry(file: Pick<File, "name" | "size" | "lastModified">): void {
  writeAll(
    readAll().filter(
      (e) => !(e.name === file.name && e.size === file.size && e.lastModified === file.lastModified),
    ),
  );
}

export function clearResumeByUploadId(uploadId: string): void {
  writeAll(readAll().filter((e) => e.uploadId !== uploadId));
}
