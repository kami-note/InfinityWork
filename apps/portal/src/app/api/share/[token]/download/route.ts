import { proxyFileManagerDownload } from "@/lib/proxy-download";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return proxyFileManagerDownload(`/public/links/${encodeURIComponent(token)}/download`, request);
}
