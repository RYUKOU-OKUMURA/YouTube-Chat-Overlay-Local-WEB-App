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
    await page.getByLabel("表示秒数").fill("3");
    await expect
      .poll(async () => {
        const response = await page.request.get("/api/settings");
        const payload = (await response.json()) as ApiResponse<Settings>;
        return payload.ok ? payload.data.displayDurationSec : null;
      })
      .toBe(3);

    await page.getByRole("button", { name: "操作画面" }).click();

    const overlayPage = await context.newPage();
    await overlayPage.goto(`/overlay/${settings.data.overlayToken}`);

    const overlayMessage = overlayPage.getByText("OBSオーバーレイ表示確認用のテストコメントです。");

    await page.getByRole("button", { name: /テストコメント/i }).click();
    await expect(page.getByText("テストコメントを送信しました。")).toBeVisible();
    await expect(overlayMessage).toBeVisible();
    await expect(overlayMessage).toBeHidden({ timeout: 5000 });

    await page.getByRole("button", { name: "表示" }).first().click();
    await expect(overlayMessage).toBeVisible();
    await expect(overlayMessage).toBeHidden({ timeout: 5000 });

    await page.getByRole("button", { name: "固定" }).first().click();
    await expect(page.getByText("コメントを固定表示しました。")).toBeVisible();
    await expect(page.getByText("固定表示")).toBeVisible();
    await expect(overlayMessage).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlayMessage).toBeVisible();

    await page.getByRole("button", { name: "固定解除" }).click();
    await expect(page.getByText("固定表示を解除しました。")).toBeVisible();
    await expect(overlayMessage).toBeHidden({ timeout: 5000 });

    await page.request.patch("/api/settings", {
      data: {
        displayDurationSec: settings.data.displayDurationSec,
        theme: settings.data.theme
      }
    });
  });
});
