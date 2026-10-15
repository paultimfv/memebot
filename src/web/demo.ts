import { config } from "../config.js";
import { launchpads } from "../ingest/index.js";
import { SimLaunchpad } from "../ingest/launchpads/sim.js";
import { initEngine, events, type LogEntry } from "../engine.js";
import { snapshot, makeActions } from "../ui/controller.js";

/**
 * Browser build of the console: the real engine + strategy code running against the
 * simulator inside the page, with no server. Built by scripts/build-demo.mjs.
 * Exposes the same calls the page normally makes over HTTP/SSE.
 */

// demo pacing: shorter holds so visitors see full trade cycles in a couple of minutes
config.exit.maxHoldSec = 150;

initEngine("paper");
const sim = new SimLaunchpad();
launchpads.set(sim.name, sim);
sim.settings.speed = 2;
sim.settings.launchesPerMin = 8;
const actions = makeActions(sim);

const logBuf: LogEntry[] = [];
type Handlers = { state?: (s: unknown) => void; log?: (e: LogEntry) => void; logs?: (l: LogEntry[]) => void };
const subs: Handlers[] = [];
events.on("log", (e: LogEntry) => {
  logBuf.push(e);
  if (logBuf.length > 300) logBuf.shift();
  subs.forEach(h => h.log?.(e));
});
setInterval(() => { const s = snapshot(sim); subs.forEach(h => h.state?.(s)); }, 500);

(window as any).memebotLocal = {
  async call(path: string, body: unknown) {
    const fn = actions[path];
    if (!fn) throw new Error(`unknown action ${path}`);
    return (await fn(body ?? {})) ?? null;
  },
  subscribe(h: Handlers) {
    subs.push(h);
    h.logs?.([...logBuf]);
    h.state?.(snapshot(sim));
  },
};

void sim.start();
