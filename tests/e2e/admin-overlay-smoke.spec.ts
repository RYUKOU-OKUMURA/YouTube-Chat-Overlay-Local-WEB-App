import { expect, test } from "@playwright/test";
import type { Settings, ApiResponse } from "@/types";

test.describe("admin/overlay smoke", () => {
  test("opens admin and overlay and exercises the test-comment flow", async ({ context, page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /YouTubeコメントオーバーレイ管理/i })).toBeVisible();

    const settingsResponse = await page.request.get("/api/settings");
    const settings = (await settingsResponse.json()) as ApiResponse<Settings>;
    expect(settings.ok).toBe(true);
    if (!settings.ok) {
      throw new Error(settings.error.message);
    }

    await page.getByRole("button", { name: "管理・設定" }).click();
    await expect(page.getByLabel("表示秒数")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "固定解除" })).toHaveCount(0);

    await page.getByRole("button", { name: "操作画面" }).click();
    await expect(page.getByRole("button", { name: "固定" })).toHaveCount(0);

    const overlayPage = await context.newPage();
    await overlayPage.goto(`/overlay/${settings.data.overlayToken}`);

    const overlayMessage = overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。");

    await page.getByRole("button", { name: /テストコメント/i }).click();
    await expect(page.getByText("テストコメントを送信しました。")).toBeVisible();
    await expect(overlayMessage).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlayMessage).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).first().click();
    await expect(overlayMessage).toBeHidden();

    const testMessageCard = page.locator("article").filter({ hasText: "OBSオーバーレイ表示確認用のテストコメントです。" }).first();
    await testMessageCard.click();
    await expect(overlayMessage).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlayMessage).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).first().click();
    await expect(overlayMessage).toBeHidden();

    await testMessageCard.getByRole("button", { name: "表示" }).click();
    await expect(page.getByText("コメントを表示しました。")).toBeVisible();
    await expect(overlayMessage).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlayMessage).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).first().click();
    await expect(overlayMessage).toBeHidden();

    await page.request.patch("/api/settings", {
      data: {
        theme: settings.data.theme
      }
    });
  });
});
