import { NextResponse } from "next/server";
import { FILE_MANAGER_SERVICE_URL } from "./config";

/** Proxies a file-manager download, forwarding Range / If-None-Match / disposition. */
export async function proxyFileManagerDownload(
  upstreamPath: string,
  request: Request,
  extraHeaders?: Record<string, string>,
) {
  const disposition = new URL(request.url).searchParams.get("disposition");
  const qs = disposition === "inline" ? "?disposition=inline" : "";

  const headers: Record<string, string> = { ...extraHeaders };
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}${upstreamPath}${qs}`, { headers });

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
