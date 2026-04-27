import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { appController } from "@/server/state/appController";
import { socketEvents } from "@/types";

let io: Server | null = null;

type SocketData = {
  role?: "admin" | "overlay";
  overlayToken?: string;
};

const adminRoom = "admin";

function overlayRoom(overlayToken: string) {
  return `overlay:${overlayToken}`;
}

function emitToCurrentOverlayRoom(eventName: string, payload: unknown) {
  void appController
    .getState()
    .then((state) => {
      io?.to(overlayRoom(state.overlayToken)).emit(eventName, payload);
    })
    .catch(() => undefined);
}

export function attachSocketServer(httpServer: HttpServer) {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: true,
      credentials: false
    }
  });

  io.on("connection", (socket) => {
    socket.on(socketEvents.adminSubscribe, async () => {
      await appController.init();
      const data = socket.data as SocketData;
      data.role = "admin";
      data.overlayToken = undefined;
      await socket.join(adminRoom);
      socket.emit(socketEvents.stateSync, await appController.getState());
    });

    socket.on(socketEvents.overlaySubscribe, async (payload?: { overlayToken?: string }) => {
      const overlayToken = payload?.overlayToken;
      const state = await appController.getState();
      if (!overlayToken) {
        socket.disconnect(true);
        return;
      }
      if (overlayToken !== state.overlayToken) {
        socket.disconnect(true);
        return;
      }
      const data = socket.data as SocketData;
      data.role = "overlay";
      data.overlayToken = overlayToken;
      await socket.join(overlayRoom(overlayToken));
      await appController.setOverlayConnected(true);
      socket.emit(socketEvents.overlaySync, state.overlay);
    });

    socket.on(socketEvents.requestSync, async () => {
      const state = await appController.getState();
      const data = socket.data as SocketData;

      if (data.role === "admin") {
        socket.emit(socketEvents.stateSync, state);
        return;
      }

      if (data.role === "overlay") {
        if (data.overlayToken !== state.overlayToken) {
          socket.disconnect(true);
          return;
        }
        socket.emit(socketEvents.overlaySync, state.overlay);
      }
    });

    socket.on("disconnect", async () => {
      const data = socket.data as SocketData;
      if (data.role !== "overlay") {
        return;
      }
      const state = await appController.getState();
      const sockets = await io?.in(overlayRoom(state.overlayToken)).fetchSockets();
      if (!sockets || sockets.length === 0) {
        await appController.setOverlayConnected(false);
      }
    });
  });

  appController.events.on("state:sync", (state) => {
    io?.to(adminRoom).emit(socketEvents.stateSync, state);
    io?.to(overlayRoom(state.overlayToken)).emit(socketEvents.overlaySync, state.overlay);
  });
  appController.events.on("comment:new", (message) => io?.to(adminRoom).emit(socketEvents.commentNew, message));
  appController.events.on("youtube:status", (status) => io?.to(adminRoom).emit(socketEvents.youtubeStatus, status));
  appController.events.on("broadcast:status", (status) => io?.to(adminRoom).emit(socketEvents.broadcastStatus, status));
  appController.events.on("overlay:connected", (payload) => io?.to(adminRoom).emit(socketEvents.overlayConnected, payload));
  appController.events.on("overlay:state", (state) => {
    emitToCurrentOverlayRoom(socketEvents.overlayState, state);
  });
  appController.events.on("overlay:show", (state) => {
    emitToCurrentOverlayRoom(socketEvents.overlayShow, state);
  });
  appController.events.on("overlay:hide", (state) => {
    emitToCurrentOverlayRoom(socketEvents.overlayHide, state);
  });
  appController.events.on("overlay:test", (state) => {
    emitToCurrentOverlayRoom(socketEvents.overlayTest, state);
  });
  appController.events.on("overlay:theme:update", (settings) => {
    emitToCurrentOverlayRoom(socketEvents.overlayThemeUpdate, { theme: settings.theme });
  });

  return io;
}
