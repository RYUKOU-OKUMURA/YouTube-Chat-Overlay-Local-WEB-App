import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  generateAuthUrl: vi.fn(),
  setCredentials: vi.fn(),
  on: vi.fn(),
  readYouTubeToken: vi.fn(),
  writeYouTubeToken: vi.fn(),
  clearYouTubeToken: vi.fn()
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2() {
        return {
          getToken: mocks.getToken,
          generateAuthUrl: mocks.generateAuthUrl,
          setCredentials: mocks.setCredentials,
          on: mocks.on
        };
      })
    }
  }
}));

vi.mock("@/server/youtube/tokenStore", () => ({
  readYouTubeToken: mocks.readYouTubeToken,
  writeYouTubeToken: mocks.writeYouTubeToken,
  clearYouTubeToken: mocks.clearYouTubeToken
}));

describe("YouTube OAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  test("preserves an existing refresh token when code exchange omits one", async () => {
    const { exchangeCode } = await import("@/server/youtube/oauth");
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "new-access-token",
        expiry_date: 1_777_777_777_000
      }
    });
    mocks.readYouTubeToken.mockResolvedValue({
      accessToken: "old-access-token",
      refreshToken: "existing-refresh-token",
      expiryDate: 1_700_000_000_000
    });

    await exchangeCode("oauth-code");

    expect(mocks.writeYouTubeToken).toHaveBeenCalledWith({
      accessToken: "new-access-token",
      refreshToken: "existing-refresh-token",
      expiryDate: 1_777_777_777_000
    });
  });

  test("reports refresh token and access token expiry in YouTube status", async () => {
    const { getYouTubeStatus } = await import("@/server/youtube/oauth");
    mocks.readYouTubeToken.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiryDate: Date.parse("2026-04-28T03:04:05.000Z")
    });

    await expect(getYouTubeStatus()).resolves.toEqual({
      oauth: "authorized",
      api: "connected",
      hasRefreshToken: true,
      accessTokenExpiresAt: "2026-04-28T03:04:05.000Z",
      needsReconnect: false
    });
  });

  test("marks authorized tokens without refresh tokens as needing reconnect", async () => {
    const { getYouTubeStatus } = await import("@/server/youtube/oauth");
    mocks.readYouTubeToken.mockResolvedValue({
      accessToken: "access-token",
      expiryDate: Date.parse("2026-04-28T03:04:05.000Z")
    });

    await expect(getYouTubeStatus()).resolves.toEqual({
      oauth: "authorized",
      api: "connected",
      hasRefreshToken: false,
      accessTokenExpiresAt: "2026-04-28T03:04:05.000Z",
      needsReconnect: true
    });
  });

  test("reports missing tokens as unauthorized without needing reconnect", async () => {
    const { getYouTubeStatus } = await import("@/server/youtube/oauth");
    mocks.readYouTubeToken.mockResolvedValue(null);

    await expect(getYouTubeStatus()).resolves.toEqual({
      oauth: "unauthorized",
      api: "disconnected",
      hasRefreshToken: false,
      accessTokenExpiresAt: undefined,
      needsReconnect: false
    });
  });
});
