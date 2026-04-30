import { expect, test } from "@playwright/test";
import type { AppState, ChatMessage, Settings, ApiResponse } from "@/types";

type TestMessageResult = {
  message: ChatMessage;
  overlay: AppState["overlay"];
};

test.describe("admin/overlay smoke", () => {
  test("opens admin and overlay and exercises the test-comment flow", async ({ context, page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /YouTubeコメントオーバーレイ管理/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "YouTube映像プレビュー" })).toBeVisible();
    await expect(page.getByText("管理・設定で配信URLを開始するとここにプレビュー表示")).toBeVisible();
    await expect(page.getByRole("heading", { name: "配信メトリクス" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Super Chat履歴" })).toBeVisible();

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
    await page.getByRole("button", { name: "表示テーマ設定へ移動" }).click();
    await expect(page.getByRole("heading", { name: "表示・テーマ設定" })).toBeVisible();
    await page.getByRole("button", { name: "操作画面" }).click();
    await page.getByRole("button", { name: "コンパクト表示" }).click();
    await expect(page.getByRole("button", { name: "通常表示に戻す" })).toBeVisible();
    await page.getByRole("button", { name: "通常表示に戻す" }).click();

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

    await testMessageCard.getByRole("button", { name: "コメントをOBSに表示" }).click();
    await expect(page.getByText("コメントを表示しました。")).toBeVisible();
    await expect(overlayMessage).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(overlayMessage).toBeVisible();

    await page.getByRole("button", { name: "非表示" }).first().click();
    await expect(overlayMessage).toBeHidden();

    const superChatResponse = await page.request.post("/api/test-message", {
      data: {
        kind: "superChat"
      }
    });
    const superChatResult = (await superChatResponse.json()) as ApiResponse<TestMessageResult>;
    expect(superChatResult.ok).toBe(true);
    if (!superChatResult.ok) {
      throw new Error(superChatResult.error.message);
    }

    const superChatMessage = superChatResult.data.message;
    expect(superChatMessage.isSuperChat).toBe(true);
    expect(superChatMessage.amountText).toBe("¥1,000");

    const superChatAdminRow = page
      .locator("article")
      .filter({ hasText: superChatMessage.messageText })
      .filter({ hasText: "¥1,000" })
      .first();
    await expect(superChatAdminRow).toBeVisible();
    await expect(superChatAdminRow).toContainText("Super Chat");
    await expect(superChatAdminRow).toContainText("¥1,000");

    const superChatHistoryPanel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Super Chat履歴" }) });
    await expect(superChatHistoryPanel).toContainText(superChatMessage.messageText);
    await expect(superChatHistoryPanel).toContainText("¥1,000");

    const superChatOverlayCard = overlayPage
      .getByTestId("super-chat-card")
      .filter({ hasText: superChatMessage.messageText })
      .filter({ hasText: "¥1,000" })
      .first();
    await expect(superChatOverlayCard).toBeVisible();
    await expect(superChatOverlayCard).toContainText("¥1,000");
    await page.waitForTimeout(3500);
    await expect(superChatOverlayCard).toBeVisible();
    await expect(superChatOverlayCard).toContainText("¥1,000");

    await page.getByRole("button", { name: "非表示" }).first().click();
    await expect(superChatOverlayCard).toBeHidden();

    await superChatHistoryPanel.getByRole("button", { name: "表示" }).first().click();
    await expect(page.getByText("コメントを表示しました。")).toBeVisible();
    await expect(superChatOverlayCard).toBeVisible();

    await page.getByRole("button", { name: "操作画面" }).click();
    const messageList = page.getByTestId("message-list");
    await page.getByRole("button", { name: "最新へ追従" }).click();
    await expect
      .poll(async () => {
        return messageList.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 8);
      })
      .toBe(true);

    for (let index = 0; index < 16; index += 1) {
      const response = await page.request.post("/api/test-message");
      const result = (await response.json()) as ApiResponse<TestMessageResult>;
      expect(result.ok).toBe(true);
    }

    await page.getByRole("button", { name: "最新へ追従" }).click();
    await messageList.evaluate((element) => {
      element.scrollTop = 0;
    });
    const scrollTopBeforeNewMessage = await messageList.evaluate((element) => element.scrollTop);
    const response = await page.request.post("/api/test-message");
    const result = (await response.json()) as ApiResponse<TestMessageResult>;
    expect(result.ok).toBe(true);
    await expect(page.getByRole("button", { name: /新着 \d+件/ })).toBeVisible();
    await expect.poll(() => messageList.evaluate((element) => element.scrollTop)).toBe(scrollTopBeforeNewMessage);
    await page.getByRole("button", { name: /新着 \d+件/ }).click();
    await expect
      .poll(async () => {
        return messageList.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 8);
      })
      .toBe(true);

    await page.setViewportSize({ width: 430, height: 900 });
    await expect(page.getByText("プレビュー").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "コメントを検索" })).toBeVisible();

    await page.request.patch("/api/settings", {
      data: {
        theme: settings.data.theme
      }
    });
  });
});
