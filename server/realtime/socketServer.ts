import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { appController } from "@/server/state/appController";
import { socketEvents } from "@/types";

let io: Server | null = null;

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
      await socket.join("admin");
      socket.emit(socketEvents.stateSync, await appController.getState());
    });

    socket.on(socketEvents.overlaySubscribe, async ({ overlayToken }: { overlayToken: string }) => {
      const state = await appController.getState();
      if (overlayToken !== state.overlayToken) {
        socket.disconnect(true);
        return;
      }
      await socket.join(`overlay:${overlayToken}`);
      await appController.setOverlayConnected(true);
      socket.emit(socketEvents.stateSync, state);
    });

    socket.on(socketEvents.requestSync, async () => {
      socket.emit(socketEvents.stateSync, await appController.getState());
    });

    socket.on("disconnect", async () => {
      const state = await appController.getState();
      const sockets = await io?.in(`overlay:${state.overlayToken}`).fetchSockets();
      if (!sockets || sockets.length === 0) {
        await appController.setOverlayConnected(false);
      }
    });
  });

  appController.events.on("state:sync", (state) => io?.emit(socketEvents.stateSync, state));
  appController.events.on("comment:new", (message) => io?.to("admin").emit(socketEvents.commentNew, message));
  appController.events.on("youtube:status", (status) => io?.to("admin").emit(socketEvents.youtubeStatus, status));
  appController.events.on("broadcast:status", (status) => io?.to("admin").emit(socketEvents.broadcastStatus, status));
  appController.events.on("overlay:connected", (payload) => io?.to("admin").emit(socketEvents.overlayConnected, payload));
  appController.events.on("overlay:state", (state) => io?.emit(socketEvents.overlayState, state));
  appController.events.on("overlay:show", (state) => io?.emit(socketEvents.overlayShow, state));
  appController.events.on("overlay:hide", (state) => io?.emit(socketEvents.overlayHide, state));
  appController.events.on("overlay:pin", (state) => io?.emit(socketEvents.overlayPin, state));
  appController.events.on("overlay:unpin", (state) => io?.emit(socketEvents.overlayUnpin, state));
  appController.events.on("overlay:test", (state) => io?.emit(socketEvents.overlayTest, state));
  appController.events.on("overlay:theme:update", (settings) => io?.emit(socketEvents.overlayThemeUpdate, settings));

  return io;
}
