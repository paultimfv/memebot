import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchpads, startIngest } from "../ingest/index.js";
import { initEngine, events, type LogEntry } from "../engine.js";
import type { SimLaunchpad } from "../ingest/launchpads/sim.js";
import { snapshot, makeActions } from "./controller.js";

/**
 * Local test console. Runs the real engine in paper mode against the offline simulator.
 *   npm run ui  ->  http://localhost:4747
 */
const PORT = Number(process.env.UI_PORT ?? 4747);
const HTML = fileURLToPath(new URL("./index.html", import.meta.url));

initEngine("paper");
await startIngest(["sim"]);
const sim = launchpads.get("sim") as SimLaunchpad;
await sim.stop(); // start paused; hit Start in the UI
const actions = makeActions(sim);

const logBuf: LogEntry[] = [];
events.on("log", (e: LogEntry) => {
  logBuf.push(e);
  if (logBuf.length > 300) logBuf.shift();
  broadcast("log", e);
});

// ---------- SSE ----------
const clients = new Set<http.ServerResponse>();
function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}
setInterval(() => { if (clients.size) broadcast("state", snapshot(sim)); }, 500);

// ---------- http ----------
async function body(req: http.IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(HTML)); // re-read each load so edits show on refresh
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(snapshot(sim)));
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      clients.add(res);
      res.write(`event: logs\ndata: ${JSON.stringify(logBuf)}\n\n`);
      res.write(`event: state\ndata: ${JSON.stringify(snapshot(sim))}\n\n`);
      req.on("close", () => clients.delete(res));
      return;
    }
    const handler = req.method === "POST" ? actions[url.pathname] : undefined;
    if (!handler) { res.writeHead(404); return res.end("not found"); }
    const result = await handler(await body(req));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, result: result ?? null }));
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`memebot test console → http://localhost:${PORT}`);
});
