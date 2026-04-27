import { EventEmitter } from "node:events";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server as SocketIOServer } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultTheme, socketEvents, type AppState, type ChatMessage, type OverlayState, type Settings } from "@/types";

type MockAppController = {
  events: EventEmitter;
  init: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setOverlayConnected: ReturnType<typeof vi.fn>;
};

let currentState: AppState;
let appController: MockAppController;
let httpServer: HttpServer | null = null;
let ioServer: SocketIOServer | null = null;
let clients: ClientSocket[] = [];

const baseMessage: ChatMessage = {
  id: "message-1",
  platformMessageId: "platform-message-1",
  authorName: "Viewer",
  messageText: "hello overlay",
  messageType: "textMessageEvent",
  isMember: false,
  isModerator: false,
  isOwner: false,
  isSuperChat: false,
  publishedAt: "2026-04-27T12:00:00.000Z"
};

function makeOverlayState(overrides: Partial<OverlayState> = {}): OverlayState {
  return {
    currentMessage: baseMessage,
    theme: defaultTheme,
    ...overrides
  };
}

function makeAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    overlayToken: "overlay-token",
    messages: [baseMessage],
    overlay: makeOverlayState(),
    youtubeStatus: { oauth: "authorized", api: "connected" },
    broadcastStatus: { isFetchingComments: false },
    overlayConnected: false,
    ...overrides
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceSocketEvent<T>(socket: ClientSocket, eventName: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 1000);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      socket.off("connect_error", onError);
    };

    const onEvent = (payload: T) => {
      cleanup();
      resolve(payload);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once(eventName, onEvent);
    socket.once("connect_error", onError);
  });
}

async function waitForConnect(socket: ClientSocket) {
  if (socket.connected) return;
  await onceSocketEvent(socket, "connect");
}

async function startSocketServer() {
  vi.resetModules();
  currentState = makeAppState();
  appController = {
    events: new EventEmitter(),
    init: vi.fn(async () => undefined),
    getState: vi.fn(async () => currentState),
    setOverlayConnected: vi.fn(async (connected: boolean) => {
      currentState = { ...currentState, overlayConnected: connected };
    })
  };
  vi.doMock("@/server/state/appController", () => ({ appController }));

  const { attachSocketServer } = await import("@/server/realtime/socketServer");
  httpServer = createServer();
  ioServer = attachSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer?.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP port.");
  }
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function connectClient(baseUrl: string) {
  const client = createClient(baseUrl, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: false,
    forceNew: true
  });
  clients.push(client);
  return client;
}

async function subscribeAdmin(baseUrl: string) {
  const client = connectClient(baseUrl);
  await waitForConnect(client);
  const syncPromise = onceSocketEvent<AppState>(client, socketEvents.stateSync);
  client.emit(socketEvents.adminSubscribe);
  await syncPromise;
  return client;
}

async function subscribeOverlay(baseUrl: string) {
  const client = connectClient(baseUrl);
  await waitForConnect(client);
  const syncPromise = onceSocketEvent<OverlayState>(client, socketEvents.overlaySync);
  client.emit(socketEvents.overlaySubscribe, { overlayToken: currentState.overlayToken });
  await syncPromise;
  return client;
}

afterEach(async () => {
  for (const client of clients) {
    client.disconnect();
  }
  clients = [];

  if (ioServer) {
    await new Promise<void>((resolve) => {
      ioServer?.close(() => resolve());
    });
    ioServer = null;
  }

  if (httpServer?.listening) {
    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve());
    });
  }
  httpServer = null;
  vi.doUnmock("@/server/state/appController");
});

describe("socket server role-aware sync", () => {
  test("sends overlay clients overlay:sync without full AppState fields", async () => {
    const baseUrl = await startSocketServer();
    const overlayClient = connectClient(baseUrl);
    await waitForConnect(overlayClient);

    let leakedStateSync: unknown;
    overlayClient.on(socketEvents.stateSync, (payload) => {
      leakedStateSync = payload;
    });

    const syncPromise = onceSocketEvent<OverlayState>(overlayClient, socketEvents.overlaySync);
    overlayClient.emit(socketEvents.overlaySubscribe, { overlayToken: currentState.overlayToken });
    const syncPayload = await syncPromise;

    expect(syncPayload).toEqual(currentState.overlay);
    expect(syncPayload).not.toHaveProperty("messages");
    expect(syncPayload).not.toHaveProperty("youtubeStatus");
    expect(syncPayload).not.toHaveProperty("broadcastStatus");
    expect(syncPayload).not.toHaveProperty("overlayToken");
    await delay(30);
    expect(leakedStateSync).toBeUndefined();
    expect(appController.setOverlayConnected).toHaveBeenCalledWith(true);
  });

  test("routes state:sync as full admin sync and overlay-only sync", async () => {
    const baseUrl = await startSocketServer();
    const adminClient = await subscribeAdmin(baseUrl);
    const overlayClient = await subscribeOverlay(baseUrl);

    let leakedOverlayStateSync: unknown;
    overlayClient.on(socketEvents.stateSync, (payload) => {
      leakedOverlayStateSync = payload;
    });

    const nextOverlay = makeOverlayState({
      currentMessage: { ...baseMessage, id: "message-2", messageText: "fresh overlay sync" }
    });
    currentState = makeAppState({
      messages: [{ ...baseMessage, id: "message-2", messageText: "fresh overlay sync" }],
      overlay: nextOverlay
    });

    const adminSyncPromise = onceSocketEvent<AppState>(adminClient, socketEvents.stateSync);
    const overlaySyncPromise = onceSocketEvent<OverlayState>(overlayClient, socketEvents.overlaySync);
    appController.events.emit("state:sync", currentState);

    expect(await adminSyncPromise).toEqual(currentState);
    expect(await overlaySyncPromise).toEqual(nextOverlay);
    await delay(30);
    expect(leakedOverlayStateSync).toBeUndefined();
  });

  test("uses socket role for state:request-sync", async () => {
    const baseUrl = await startSocketServer();
    const adminClient = await subscribeAdmin(baseUrl);
    const overlayClient = await subscribeOverlay(baseUrl);

    let leakedOverlayStateSync: unknown;
    overlayClient.on(socketEvents.stateSync, (payload) => {
      leakedOverlayStateSync = payload;
    });

    const overlaySyncPromise = onceSocketEvent<OverlayState>(overlayClient, socketEvents.overlaySync);
    overlayClient.emit(socketEvents.requestSync);
    expect(await overlaySyncPromise).toEqual(currentState.overlay);
    await delay(30);
    expect(leakedOverlayStateSync).toBeUndefined();

    const adminSyncPromise = onceSocketEvent<AppState>(adminClient, socketEvents.stateSync);
    adminClient.emit(socketEvents.requestSync);
    expect(await adminSyncPromise).toEqual(currentState);
  });

  test("emits minimal theme updates only to overlay rooms", async () => {
    const baseUrl = await startSocketServer();
    const adminClient = await subscribeAdmin(baseUrl);
    const overlayClient = await subscribeOverlay(baseUrl);

    let adminThemePayload: unknown;
    adminClient.on(socketEvents.overlayThemeUpdate, (payload) => {
      adminThemePayload = payload;
    });

    const nextTheme = { ...defaultTheme, accentColor: "#22c55e" };
    const settings: Settings = {
      overlayToken: "do-not-leak-token",
      theme: nextTheme,
      lastBroadcastUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    };

    const themePromise = onceSocketEvent<{ theme: typeof nextTheme }>(overlayClient, socketEvents.overlayThemeUpdate);
    appController.events.emit("overlay:theme:update", settings);

    const themePayload = await themePromise;
    expect(themePayload).toEqual({ theme: nextTheme });
    expect(themePayload).not.toHaveProperty("overlayToken");
    expect(themePayload).not.toHaveProperty("lastBroadcastUrl");
    await delay(30);
    expect(adminThemePayload).toBeUndefined();
  });
});
