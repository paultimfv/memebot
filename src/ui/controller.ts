import { config } from "../config.js";
import { nativeUsd } from "../util/prices.js";
import { launchpads } from "../ingest/index.js";
import { tokens } from "../state/tokenStore.js";
import { signals } from "../strategy/exitSignals.js";
import { risk } from "../risk/riskManager.js";
import { positions, meta, launches, closed, totals, manualSell, sellAll, setKill, resetEngine } from "../engine.js";
import { SCENARIO_INFO, type SimLaunchpad, type Scenario } from "../ingest/launchpads/sim.js";

/**
 * UI-facing view of the engine + simulator. Shared by the local server (src/ui/server.ts)
 * and the in-browser demo (src/web/demo.ts) so both drive the exact same page.
 */
export function snapshot(sim: SimLaunchpad) {
  const openPositions = [...positions.values()].map(p => {
    const s = tokens.get(p.mint);
    const lp = launchpads.get(p.launchpad)!;
    const m = meta.get(p.mint);
    const px = nativeUsd(p.chain);
    const price = s?.curve ? lp.price(s.curve) : 0;
    const value = s?.curve && p.tokens > 0 ? lp.quoteSell(s.curve, p.tokens) : 0;
    return {
      mint: p.mint, symbol: s?.launch.symbol, launchpad: p.launchpad, status: p.status,
      truth: sim.truth(p.mint),
      ageSec: (Date.now() - p.openedAt) / 1000,
      tokens: p.tokens, costUsd: p.costNative * px, valueUsd: value * px,
      mult: p.costNative > 0 ? value / p.costNative : 0,
      fromHighPct: p.highWaterPrice > 0 ? (1 - price / p.highWaterPrice) * 100 : 0,
      realizedUsd: m ? (m.outTotal - (m.costTotal - p.costNative)) * px : 0,
      soldLevels: p.soldLevels,
      score: m?.score ?? 0,
      signals: (m?.signals ?? []).map(x => ({ ...x, weight: signals[x.name]?.weight ?? 0 })),
      prices: (m?.prices ?? []).map(([, v]) => v),
      entryPrice: m?.entryPrice ?? 0,
    };
  });

  const recentLaunches = [...launches.values()].slice(-60).reverse().map(v => {
    const s = tokens.get(v.launch.mint);
    const lp = launchpads.get(v.launch.launchpad);
    return {
      mint: v.launch.mint, symbol: v.launch.symbol, launchpad: v.launch.launchpad,
      ageSec: (Date.now() - v.launch.createdAt) / 1000,
      mcapUsd: s?.curve && lp ? lp.mcapNative(s.curve) * nativeUsd(lp.chain) : 0,
      trades: s?.trades.length ?? 0,
      status: v.status, reasons: v.reasons, truth: sim.truth(v.launch.mint),
    };
  });

  const exposureUsd = [...positions.values()].reduce((a, p) => a + p.costNative * nativeUsd(p.chain), 0);
  return {
    now: Date.now(),
    mode: "paper",
    sim: { running: sim.running, live: sim.liveCount(), ...sim.settings },
    scenarios: SCENARIO_INFO,
    totals: { ...totals, open: positions.size, exposureUsd, killed: risk.killed },
    positions: openPositions,
    launches: recentLaunches,
    closed: closed.slice(0, 60),
    config: { entry: config.entry, exit: config.exit, filters: config.filters, risk: config.risk },
    weights: Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, v.weight])),
  };
}

const EDITABLE = { entry: config.entry, exit: config.exit, filters: config.filters, risk: config.risk } as Record<string, Record<string, unknown>>;

export function patchConfig(section: string, key: string, value: unknown) {
  if (section === "weights") {
    if (!signals[key] || typeof value !== "number") throw new Error("bad weight");
    signals[key].weight = value;
    return;
  }
  const target = EDITABLE[section];
  if (!target || !(key in target)) throw new Error(`unknown setting ${section}.${key}`);
  const cur = target[key];
  if (typeof cur === "number" && (typeof value !== "number" || Number.isNaN(value))) throw new Error("expected a number");
  if (typeof cur === "boolean" && typeof value !== "boolean") throw new Error("expected true/false");
  if (key === "takeProfitLadder") {
    if (!Array.isArray(value) || !value.every(r => Array.isArray(r) && r.length === 2 && r.every(n => typeof n === "number" && !Number.isNaN(n)))) {
      throw new Error("ladder must be [[multiple, fraction], ...]");
    }
  }
  target[key] = value;
}

/** Route table: "METHOD /path" -> handler. The server maps HTTP onto it; the demo calls it directly. */
export function makeActions(sim: SimLaunchpad): Record<string, (b: any) => unknown | Promise<unknown>> {
  return {
    "/api/sim/start": () => sim.start(),
    "/api/sim/stop": () => sim.stop(),
    "/api/sim/launch": b => sim.launchNow(b.scenario as Scenario | undefined),
    "/api/sim/settings": b => {
      if (typeof b.launchesPerMin === "number") sim.settings.launchesPerMin = Math.max(0, Math.min(120, b.launchesPerMin));
      if (typeof b.speed === "number") sim.settings.speed = Math.max(0.25, Math.min(10, b.speed));
      if (b.weights) for (const [k, v] of Object.entries(b.weights)) {
        if (k in sim.settings.weights && typeof v === "number") sim.settings.weights[k as Scenario] = Math.max(0, v);
      }
    },
    "/api/config": b => patchConfig(b.section, b.key, b.value),
    "/api/sell": b => manualSell(b.mint, Math.max(0.01, Math.min(1, Number(b.fraction) || 1))),
    "/api/sell-all": () => sellAll("manual sell all"),
    "/api/kill": b => setKill(Boolean(b.on)),
    "/api/reset": async () => { await sim.stop(); sim.reset(); resetEngine(); },
  };
}
