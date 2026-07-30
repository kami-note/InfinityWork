/**
 * Sharing ACL + public links — API-level e2e against a running `make dev` stack.
 */
import { test, expect, FILE_MANAGER_URL } from "./fixtures";

test.describe("Sharing: public links", () => {
  test("cria link de arquivo, baixa anonimamente, revoke falha", async ({ testFolder, apiToken }) => {
    const { request } = testFolder;

    const upload = await request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: {
          name: "shared.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("hello-share"),
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const file = await upload.json();

    const linkRes = await request.post(`${FILE_MANAGER_URL}/files/${file.id}/links`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: {},
    });
    expect(linkRes.ok(), await linkRes.text()).toBeTruthy();
    const { token, id: linkId } = await linkRes.json();

    const anon = await request.get(`${FILE_MANAGER_URL}/public/links/${token}`);
    expect(anon.ok()).toBeTruthy();
    const meta = await anon.json();
    expect(meta.targetType).toBe("file");
    expect(meta.file.name).toBe("shared.txt");

    const download = await request.get(`${FILE_MANAGER_URL}/public/links/${token}/download`);
    expect(download.ok()).toBeTruthy();
    expect(await download.text()).toBe("hello-share");

    const revoke = await request.delete(`${FILE_MANAGER_URL}/files/${file.id}/links/${linkId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(revoke.status()).toBe(204);

    const after = await request.get(`${FILE_MANAGER_URL}/public/links/${token}/download`);
    expect(after.status()).toBe(404);
  });

  test("link de pasta rejeita fileId fora da árvore", async ({ testFolder, apiToken }) => {
    const { request } = testFolder;

    const sharedFolder = await request.post(`${FILE_MANAGER_URL}/folders`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: { name: "shared-root", parentId: testFolder.id },
    });
    expect(sharedFolder.ok()).toBeTruthy();
    const { id: sharedFolderId } = await sharedFolder.json();

    const otherFolder = await request.post(`${FILE_MANAGER_URL}/folders`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: { name: "other-root", parentId: testFolder.id },
    });
    expect(otherFolder.ok()).toBeTruthy();
    const { id: otherFolderId } = await otherFolder.json();

    const inside = await request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: sharedFolderId,
        file: { name: "in.txt", mimeType: "text/plain", buffer: Buffer.from("in") },
      },
    });
    expect(inside.ok()).toBeTruthy();
    const inFile = await inside.json();

    const outside = await request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: otherFolderId,
        file: { name: "out.txt", mimeType: "text/plain", buffer: Buffer.from("out") },
      },
    });
    expect(outside.ok()).toBeTruthy();
    const outFile = await outside.json();

    const linkRes = await request.post(`${FILE_MANAGER_URL}/folders/${sharedFolderId}/links`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: {},
    });
    expect(linkRes.ok()).toBeTruthy();
    const { token } = await linkRes.json();

    const okDl = await request.get(
      `${FILE_MANAGER_URL}/public/links/${token}/files/${inFile.id}/download`,
    );
    expect(okDl.ok()).toBeTruthy();
    expect(await okDl.text()).toBe("in");

    const badDl = await request.get(
      `${FILE_MANAGER_URL}/public/links/${token}/files/${outFile.id}/download`,
    );
    expect(badDl.status()).toBe(403);
  });
});

test.describe("Sharing: user ACL", () => {
  test("share file lista grants e rejeita role owner", async ({ testFolder, apiToken }) => {
    const { request } = testFolder;

    const upload = await request.post(`${FILE_MANAGER_URL}/files`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      multipart: {
        folderId: testFolder.id,
        file: { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("owned-by-uploader") },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const file = await upload.json();

    const grantee = "00000000-0000-4000-8000-000000000099";
    const share = await request.post(`${FILE_MANAGER_URL}/files/${file.id}/share`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: { userId: grantee, role: "viewer" },
    });
    expect(share.ok(), await share.text()).toBeTruthy();

    const perms = await request.get(`${FILE_MANAGER_URL}/files/${file.id}/permissions`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(perms.ok()).toBeTruthy();
    const list = await perms.json();
    expect(list.some((p: { userId: string }) => p.userId === grantee)).toBeTruthy();

    const badRole = await request.post(`${FILE_MANAGER_URL}/files/${file.id}/share`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      data: { userId: grantee, role: "owner" },
    });
    expect(badRole.status()).toBe(400);

    const root = await request.get(`${FILE_MANAGER_URL}/folders`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(root.ok()).toBeTruthy();
    const rootBody = await root.json();
    expect(Array.isArray(rootBody.files)).toBeTruthy();
  });

  test("UI: compartilhar no menu e página /drive/shared", async ({ authedPage: page, testFolder }) => {
    await page.goto(`/drive?folderId=${testFolder.id}`);
    await page.getByRole("button", { name: "Novo" }).click();
    page.once("dialog", (d) => d.accept("Pasta Share UI"));
    await page.getByRole("button", { name: "Nova pasta" }).click();
    await expect(page.getByText("Pasta Share UI")).toBeVisible();

    await page.locator("[data-item-id]", { hasText: "Pasta Share UI" }).click({ button: "right" });
    await expect(page.getByRole("button", { name: "Compartilhar" })).toBeVisible();
    await page.getByRole("button", { name: "Compartilhar" }).click();
    await expect(page.getByRole("heading", { name: "Compartilhar" })).toBeVisible();
    await expect(page.getByText("Link público")).toBeVisible();
    await page.getByRole("button", { name: "Fechar" }).click();

    await page.goto("/drive/shared");
    await expect(page.getByRole("heading", { name: "Compartilhados comigo" })).toBeVisible();
  });
});
