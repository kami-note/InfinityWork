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

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files/${id}/download${qs}`, { headers });

  // 200 (full content) and 206 (partial content) both count as success here;
  // 416 (range not satisfiable) still carries a body-less response we want
  // to relay as-is rather than mapping to a generic error.
  if (!res.body && res.status !== 416) {
    return NextResponse.json({ error: "download_failed" }, { status: res.status || 500 });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
  };
  for (const name of ["accept-ranges", "content-range", "content-length"]) {
    const value = res.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  return new NextResponse(res.body, { status: res.status, headers: responseHeaders });
}
