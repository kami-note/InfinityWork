import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { test, expect, FILE_MANAGER_URL } from "./fixtures";

function makePng(): string {
  const w = 4;
  const h = 4;
  const raw = Buffer.concat(
    Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 200)])),
  );
  function chunk(tag: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const tagBuf = Buffer.from(tag);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([tagBuf, data])) >>> 0);
    return Buffer.concat([len, tagBuf, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // color type RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const filePath = path.join(os.tmpdir(), `e2e-${Date.now()}.png`);
  fs.writeFileSync(filePath, png);
  return filePath;
}

async function uploadViaApi(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  folderId: string,
  filePath: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const res = await request.post(`${FILE_MANAGER_URL}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      folderId,
      file: { name: fileName, mimeType, buffer: fs.readFileSync(filePath) },
    },
  });
  expect(res.ok(), `upload failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.id;
}

test.describe("Visualizador de arquivos", () => {
  test("imagem renderiza no visualizador", async ({ authedPage: page, testFolder, apiToken }) => {
    const filePath = makePng();
    const id = await uploadViaApi(testFolder.request, apiToken, testFolder.id, filePath, "foto.png", "image/png");

    await page.goto(`/view/${id}`);
    await expect(page.locator("img")).toBeVisible();
    fs.unlinkSync(filePath);
  });

  test("texto renderiza o conteúdo real do arquivo", async ({ authedPage: page, testFolder, apiToken }) => {
    const filePath = path.join(os.tmpdir(), `e2e-${Date.now()}.md`);
    fs.writeFileSync(filePath, "# Título do teste E2E\n\nConteúdo verificável.");
    const id = await uploadViaApi(testFolder.request, apiToken, testFolder.id, filePath, "nota.md", "text/markdown");

    await page.goto(`/view/${id}`);
    await expect(page.locator("pre")).toContainText("Título do teste E2E");
    await expect(page.locator("pre")).toContainText("Conteúdo verificável.");
    fs.unlinkSync(filePath);
  });

  test("regressão: PDF é servido com Content-Disposition inline para visualização", async ({
    testFolder,
    apiToken,
  }) => {
    // Bug found in production: the download route always sent "attachment",
    // which makes a browser force-download a PDF instead of rendering it in
    // the <iframe> viewer. The explicit "Baixar" link still gets the
    // default (no query param = attachment).
    const filePath = path.join(os.tmpdir(), `e2e-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, "%PDF-1.4\n%%EOF");
    const id = await uploadViaApi(testFolder.request, apiToken, testFolder.id, filePath, "doc.pdf", "application/pdf");

    const inline = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download?disposition=inline`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(inline.headers()["content-disposition"]).toContain("inline");

    const attachment = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(attachment.headers()["content-disposition"]).toContain("attachment");

    fs.unlinkSync(filePath);
  });
});
