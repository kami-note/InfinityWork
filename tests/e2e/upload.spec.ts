import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test, expect, FILE_MANAGER_URL } from "./fixtures";

function makeTestFile(sizeMB: number): string {
  const filePath = path.join(os.tmpdir(), `e2e-upload-${sizeMB}mb-${Date.now()}.bin`);
  fs.writeFileSync(filePath, Buffer.alloc(sizeMB * 1024 * 1024, 1));
  return filePath;
}

test.describe("Upload", () => {
  test("arquivo pequeno aparece na pasta e o widget mostra concluído", async ({ authedPage: page, testFolder }) => {
    const filePath = makeTestFile(1);
    await page.goto(`/drive?folderId=${testFolder.id}`);

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Selecionar arquivos").click(),
    ]);
    await fileChooser.setFiles(filePath);

    await expect(page.getByText(/arquivo\(s\) enviado\(s\)/)).toBeVisible({ timeout: 15000 });
    await expect(page.locator("[data-item-id]", { hasText: path.basename(filePath) })).toBeVisible();

    fs.unlinkSync(filePath);
  });

  test("regressão: upload lento ainda vai para a pasta certa, não a raiz", async ({
    authedPage: page,
    testFolder,
    apiToken,
  }) => {
    test.setTimeout(60000); // throttled upload below is deliberately slow
    // This is the exact bug found in production use: @fastify/multipart only
    // has the `folderId` field parsed by the time it hands back the file
    // stream if that field comes *before* the file in the multipart body.
    // A fast/tiny upload can mask the bug (the whole body arrives in one
    // read); throttling forces the file part to stream slowly enough to
    // expose it — matching what real users hit with large files.
    const client = await page.context().newCDPSession(page);
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (2 * 1024 * 1024) / 8,
      uploadThroughput: (2 * 1024 * 1024) / 8,
      latency: 20,
    });

    const filePath = makeTestFile(3);
    await page.goto(`/drive?folderId=${testFolder.id}`);

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Selecionar arquivos").click(),
    ]);
    await fileChooser.setFiles(filePath);

    await expect(page.getByText(/arquivo\(s\) enviado\(s\)/)).toBeVisible({ timeout: 30000 });

    const contents = await testFolder.request.get(`${FILE_MANAGER_URL}/folders?parentId=${testFolder.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = await contents.json();
    expect(body.files.map((f: { name: string }) => f.name)).toContain(path.basename(filePath));

    fs.unlinkSync(filePath);
  });
});
