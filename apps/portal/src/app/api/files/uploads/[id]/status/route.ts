import { proxyFileManagerJson } from "@/lib/proxy-file-manager";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyFileManagerJson(`/uploads/${id}/status`);
}
