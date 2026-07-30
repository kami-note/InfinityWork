import { proxyFileManagerDownload } from "@/lib/proxy-download";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  return proxyFileManagerDownload(
    `/public/links/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}/download`,
    request,
  );
}
