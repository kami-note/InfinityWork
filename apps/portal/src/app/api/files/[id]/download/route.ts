import { requireAccessToken } from "@/lib/session";
import { proxyFileManagerDownload } from "@/lib/proxy-download";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await requireAccessToken();
  return proxyFileManagerDownload(`/files/${id}/download`, request, {
    Authorization: `Bearer ${token}`,
  });
}
