import { test, expect, FILE_MANAGER_URL } from "./fixtures";

test.describe("Streaming de vídeo (HTTP Range Requests)", () => {
  test("range request retorna 206 com exatamente os bytes pedidos", async ({ testFolder, apiToken }) => {
    // Content is a repeating 0..255 byte sequence — easy to assert an exact
    // slice came back, not just "some bytes".
    const size = 1000;
    const content = Buffer.from(Array.from({ length: size }, (_, i) => i % 256));

    const upload = await testFolder.request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "clip.mp4", mimeType: "video/mp4", buffer: content },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const { id } = await upload.json();

    const res = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${apiToken}`, Range: "bytes=100-199" },
    });

    expect(res.status()).toBe(206);
    expect(res.headers()["content-range"]).toBe(`bytes 100-199/${size}`);
    expect(res.headers()["content-length"]).toBe("100");
    expect(res.headers()["accept-ranges"]).toBe("bytes");

    const body = await res.body();
    expect(body.equals(content.subarray(100, 200))).toBeTruthy();
  });

  test("sem header Range retorna o arquivo inteiro com Accept-Ranges anunciado", async ({ testFolder, apiToken }) => {
    const content = Buffer.from("a".repeat(500));
    const upload = await testFolder.request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "clip2.mp4", mimeType: "video/mp4", buffer: content },
      },
    });
    const { id } = await upload.json();

    const res = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["accept-ranges"]).toBe("bytes");
    expect((await res.body()).length).toBe(500);
  });

  test("range inválido (além do tamanho do arquivo) retorna 416", async ({ testFolder, apiToken }) => {
    const content = Buffer.from("small file");
    const upload = await testFolder.request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "clip3.mp4", mimeType: "video/mp4", buffer: content },
      },
    });
    const { id } = await upload.json();

    const res = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${apiToken}`, Range: "bytes=9999-19999" },
    });
    expect(res.status()).toBe(416);
  });

  test("proxy do portal repassa o Range corretamente", async ({ authedPage, testFolder, apiToken }) => {
    const size = 1000;
    const content = Buffer.from(Array.from({ length: size }, (_, i) => i % 256));
    const upload = await testFolder.request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "clip.mp4", mimeType: "video/mp4", buffer: content },
      },
    });
    const { id } = await upload.json();

    const res = await authedPage.request.get(`/api/files/${id}/download`, {
      headers: { Range: "bytes=200-299" },
    });
    expect(res.status()).toBe(206);
    expect(res.headers()["content-range"]).toBe(`bytes 200-299/${size}`);
    const body = await res.body();
    expect(body.equals(content.subarray(200, 300))).toBeTruthy();
  });

  test("range aberto (bytes=0-) é limitado a no máximo 2MB por resposta", async ({ testFolder, apiToken }) => {
    // 3 MiB payload — without the cap, `bytes=0-` would stream the whole file.
    const size = 3 * 1024 * 1024;
    const content = Buffer.alloc(size, 7);
    const upload = await testFolder.request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "big.mp4", mimeType: "video/mp4", buffer: content },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const { id } = await upload.json();

    const res = await testFolder.request.get(`${FILE_MANAGER_URL}/files/${id}/download`, {
      headers: { Authorization: `Bearer ${apiToken}`, Range: "bytes=0-" },
    });

    expect(res.status()).toBe(206);
    expect(res.headers()["content-range"]).toBe(`bytes 0-${2 * 1024 * 1024 - 1}/${size}`);
    expect(res.headers()["content-length"]).toBe(String(2 * 1024 * 1024));
    expect((await res.body()).length).toBe(2 * 1024 * 1024);
  });
});
