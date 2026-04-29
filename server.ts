import { createServer } from "node:http";
import next from "next";
import nextEnv from "@next/env";
import { attachSocketServer } from "@/server/realtime/socketServer";
import { appController } from "@/server/state/appController";

nextEnv.loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();
await appController.init();

const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/_next/static/")) {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (name.toLowerCase() === "cache-control") {
        return setHeader(name, "no-store, no-cache, must-revalidate, proxy-revalidate");
      }
      return setHeader(name, value);
    };
  }

  void handle(req, res);
});

attachSocketServer(httpServer);

httpServer.listen(port, hostname, () => {
  console.log(`Ready on http://${hostname}:${port}`);
});
