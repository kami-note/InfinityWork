import { test, expect } from "./fixtures";

test.describe("Drive: pastas", () => {
  test("cria, renomeia e exclui uma pasta", async ({ authedPage: page, testFolder }) => {
    await page.goto(`/drive?folderId=${testFolder.id}`);

    await page.getByRole("button", { name: "Novo" }).click();
    // The dialog listener must be attached before the click that triggers
    // window.prompt()/confirm() — Playwright auto-dismisses any dialog that
    // fires with no listener registered yet, so attaching it after the
    // click is a race (it usually loses, since prompt() fires synchronously
    // inside the click handler).
    page.once("dialog", (d) => d.accept("Pasta E2E"));
    await page.getByRole("button", { name: "Nova pasta" }).click();
    await expect(page.getByText("Pasta E2E")).toBeVisible();

    await page.locator("[data-item-id]", { hasText: "Pasta E2E" }).click({ button: "right" });
    page.once("dialog", (d) => d.accept("Pasta E2E renomeada"));
    await page.getByRole("button", { name: "Renomear" }).click();
    await expect(page.getByText("Pasta E2E renomeada")).toBeVisible();

    await page.locator("[data-item-id]", { hasText: "Pasta E2E renomeada" }).click({ button: "right" });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Pasta E2E renomeada")).not.toBeVisible();
  });

  test("seleção com Ctrl+clique e Ctrl+A", async ({ authedPage: page, testFolder, apiToken }) => {
    for (const name of ["a", "b"]) {
      await testFolder.request.post(`${process.env.E2E_FILE_MANAGER_URL ?? "http://localhost:4002"}/folders`, {
        headers: { Authorization: `Bearer ${apiToken}` },
        data: { name, parentId: testFolder.id },
      });
    }
    await page.goto(`/drive?folderId=${testFolder.id}`);
    await expect(page.locator("[data-item-id]")).toHaveCount(2);

    await page.locator("[data-item-id]").first().click({ modifiers: ["Control"] });
    await expect(page.getByText("Excluir 1 selecionado")).toBeVisible();

    await page.keyboard.press("Control+a");
    await expect(page.getByText("Excluir 2 selecionado")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText(/Excluir \d selecionado/)).not.toBeVisible();
  });
});
