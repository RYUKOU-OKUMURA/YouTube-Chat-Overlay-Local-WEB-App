import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  updateSettings: vi.fn(),
  sendTestMessage: vi.fn()
}));

vi.mock("@/server/state/appController", () => ({
  appController: {
    getState: mocks.getState,
    updateSettings: mocks.updateSettings,
    sendTestMessage: mocks.sendTestMessage
  }
}));

function request(method: string, body: string) {
  return new Request("http://localhost/test", { method, body });
}

async function json(response: Response) {
  return response.json();
}

describe("API JSON body parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSettings.mockResolvedValue({ theme: { fontSize: 28 } });
    mocks.sendTestMessage.mockResolvedValue({ id: "test-message" });
  });

  test("settings PATCH returns a shaped validation error for malformed JSON", async () => {
    const { PATCH } = await import("@/app/api/settings/route");

    const response = await PATCH(request("PATCH", "{") as NextRequest);

    expect(response.status).toBe(422);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Malformed JSON body."
      }
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  test("settings PATCH rejects an empty body by default", async () => {
    const { PATCH } = await import("@/app/api/settings/route");

    const response = await PATCH(request("PATCH", "") as NextRequest);

    expect(response.status).toBe(422);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body is required."
      }
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  test("settings PATCH rejects schema mismatches", async () => {
    const { PATCH } = await import("@/app/api/settings/route");

    const response = await PATCH(request("PATCH", JSON.stringify({ theme: { fontSize: 8 } })) as NextRequest);

    expect(response.status).toBe(422);
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  test("test-message POST returns a shaped validation error for malformed JSON", async () => {
    const { POST } = await import("@/app/api/test-message/route");

    const response = await POST(request("POST", "{"));

    expect(response.status).toBe(422);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Malformed JSON body."
      }
    });
    expect(mocks.sendTestMessage).not.toHaveBeenCalled();
  });

  test("test-message POST rejects schema mismatches", async () => {
    const { POST } = await import("@/app/api/test-message/route");

    const response = await POST(request("POST", JSON.stringify({ kind: "unsupported" })));

    expect(response.status).toBe(422);
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
    expect(mocks.sendTestMessage).not.toHaveBeenCalled();
  });

  test("test-message POST preserves empty body as an empty input object", async () => {
    const { POST } = await import("@/app/api/test-message/route");

    const response = await POST(request("POST", ""));

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      ok: true,
      data: { id: "test-message" }
    });
    expect(mocks.sendTestMessage).toHaveBeenCalledWith({});
  });

  test("parseJsonBody returns a shaped validation error when the body cannot be read", async () => {
    const { parseJsonBody } = await import("@/lib/http");
    const consumedRequest = request("POST", "{}");
    await consumedRequest.text();

    const parsed = await parseJsonBody(consumedRequest, z.object({}));

    if (parsed.success) {
      throw new Error("Expected parseJsonBody to fail for a consumed body.");
    }
    expect(parsed.response.status).toBe(422);
    await expect(json(parsed.response)).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Unable to read request body."
      }
    });
  });
});
