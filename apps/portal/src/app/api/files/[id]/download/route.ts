import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await requireAccessToken();
  const disposition = new URL(request.url).searchParams.get("disposition");
  const qs = disposition === "inline" ? "?disposition=inline" : "";

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Forwarding Range is what makes video/audio seeking work — without it
  // every seek would re-fetch the whole file instead of just the bytes the
  // player asked for.
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  // Forwarding If-None-Match is what lets a repeat visit (page reload, a
  // video/image re-rendering the same tile) get a cheap 304 from
  // file-manager instead of re-reading and re-sending the whole file.
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files/${id}/download${qs}`, { headers });

  // 200 (full content), 206 (partial content), and 304 (not modified) all
  // carry a body-less-or-present response we want to relay as-is; 416
  // (range not satisfiable) is also body-less but not an error either.
  if (!res.body && res.status !== 416 && res.status !== 304) {
    return NextResponse.json({ error: "download_failed" }, { status: res.status || 500 });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
  };
  for (const name of ["accept-ranges", "content-range", "content-length", "etag", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  return new NextResponse(res.status === 304 ? null : res.body, { status: res.status, headers: responseHeaders });
}
