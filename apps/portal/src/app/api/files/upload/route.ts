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
  const formData = await request.formData();

  const res = await fetch(`${FILE_MANAGER_SERVICE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await res.text();

  // Force garbage collection in the next event loop tick if enabled
  // to prevent RAM from staying high after large formData parsing
  if (global.gc) {
    setTimeout(() => {
      global.gc?.();
    }, 0);
  }

  return new NextResponse(body, { status: res.status, headers: { "Content-Type": "application/json" } });
}
