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
    await page.request.patch("/api/settings", {
      data: {
        displayDurationSec: 3,
        theme: settings.data.theme
      }
    });

    const overlayPage = await context.newPage();
    await overlayPage.goto(`/overlay/${settings.data.overlayToken}`);

    await page.getByRole("button", { name: /テストコメント/i }).click();
    await expect(page.getByText("テストコメントを送信しました。")).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).click();
    await expect(overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。")).toBeHidden();

    await page.getByText("OBSオーバーレイ表示確認用のテストコメントです。").click();
    await expect(overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。")).toBeVisible();
    await expect(page.getByRole("button", { name: "表示" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "固定" })).toHaveCount(0);
    await expect(page.getByText("表示秒数")).toHaveCount(0);

    await page.waitForTimeout(3500);
    await expect(overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。")).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).click();
    await expect(overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。")).toBeHidden();
  });
});
