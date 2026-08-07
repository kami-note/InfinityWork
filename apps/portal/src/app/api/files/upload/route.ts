import { NextResponse } from "next/server";
import { requireAccessToken } from "@/lib/session";
import { FILE_MANAGER_SERVICE_URL } from "@/lib/config";

/**
 * Only the portal is reachable from the browser, so upload traffic has to
 * pass through here even though the heavy lifting (streaming to disk,
 * checksum) happens in the file-manager service.
 *
 * This used to forward `request.body` as a raw stream, which silently
 * truncated uploads above ~10MB ("Part terminated early due to unexpected
 * end of multipart data" on the file-manager side) — a Next.js dev-server
 * streaming quirk with piped request bodies. Parsing into FormData and
 * re-sending it lets undici's fetch compute a real Content-Length instead
 * of chunked-streaming a body that dev mode doesn't reliably pipe through.
 */
export async function POST(request: Request) {
  const token = await requireAccessToken();
  // Decide streaming vs buffering:
  // - In production we stream `request.body` directly to the file-manager to avoid
  //   materializing the entire upload in the portal process.
  // - In development we keep using `request.formData()` because the Next.js
  //   dev server has a known quirk that can truncate piped request bodies for
  //   large multipart uploads (see top-of-file comment and the traycer artifact
  //   /home/levi/.traycer/epics/9e4d3d73-47df-46e1-a87b-27d1117d6499/artifacts/perf-optimization-plan/streaming-upload/index.md).
  // This branch ensures we get streaming behavior in production while remaining
  // safe and testable in `next dev`.
  const isProd = process.env.NODE_ENV === "production";

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: BodyInit | null = null;

  if (isProd) {
    // Forward the original Content-Type so file-manager can parse multipart.
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;

    // Stream the incoming request through directly. undici/node fetch requires
    // `duplex: "half"` when passing a stream as the body.
    body = request.body;
  } else {
    const formData = await request.formData();
    body = formData;
  }

  const fetchOptions: any = {
    method: "POST",
    headers,
    body,
  };
  // Only set duplex when streaming a real body (undici requires it).
  if (isProd) {
    // duplex is not in the standard TypeScript lib for Fetch; undici expects it.
    // @ts-ignore
    fetchOptions.duplex = "half";
  }

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files`, fetchOptions);

  const resBody = await res.text();

  // Force garbage collection in the next event loop tick if enabled
  // to prevent RAM from staying high after large formData parsing
  if (global.gc) {
    setTimeout(() => {
      global.gc?.();
    }, 0);
  }

  return new NextResponse(resBody, { status: res.status, headers: { "Content-Type": "application/json" } });
}
