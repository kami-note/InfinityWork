import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; index: string }> };

/**
 * Proxy one file chunk as a raw byte stream.
 *
 * Never use request.formData() here — that buffers the whole chunk in memory
 * and will OOM a cheap VPS under parallel ~80MB uploads.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const token = await requireAccessToken();
  const { id, index } = await ctx.params;
  const contentLength = request.headers.get("content-length");

  if (!request.body) {
    return NextResponse.json({ error: "invalid", message: "empty body" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/octet-stream",
  };
  if (contentLength) headers["Content-Length"] = contentLength;

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/uploads/${id}/chunks/${index}`, {
    method: "PUT",
    headers,
    body: request.body,
    // Required by Node undici when streaming a request body.
    duplex: "half",
  } as RequestInit);

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const text = await res.text();

  // Force garbage collection in the next event loop tick if enabled
  // to prevent RAM from staying high after streaming large chunks
  if (global.gc) {
    setTimeout(() => {
      global.gc?.();
    }, 0);
  }

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
