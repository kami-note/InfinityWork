import { proxyFileManagerJson } from "@/lib/proxy-file-manager";

/** Start a chunked upload session (metadata only — no file body). */
export async function POST(request: Request) {
  return proxyFileManagerJson("/uploads", { method: "POST", body: await request.text() });
}
