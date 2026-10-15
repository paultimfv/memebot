import type { Launchpad } from "./Launchpad.js";
import { cp } from "./Launchpad.js";
import type { CurveState, Fill, Mint, Wallet } from "../../types.js";
import { bus } from "../../util/bus.js";
import { intel } from "../../intel/walletIntel.js";
import { clusters } from "../../intel/clusters.js";

/**
 * Offline launchpad: generates fake launches + trades on a pump.fun-style curve so the
 * whole bot (filters, sizing, exit signals, risk) can be exercised with no RPC or wallet.
 * Each token secretly follows a scenario so you can check whether the bot read it right.
 */
export type Scenario = "pump" | "rug" | "bleed" | "bundled" | "serial" | "dud";

export const SCENARIO_INFO: Record<Scenario, string> = {
  pump: "real demand, runs, then early holders distribute",
  rug: "decent start, then dev + linked wallets dump",
  bleed: "weak demand, slow grind down",
  bundled: "dev cluster buys a big chunk in the launch block, then dumps (filter should skip)",
  serial: "dev is a known rugger (filter should skip), then dumps",
  dud: "almost nobody shows up",
};

interface SimToken {
  mint: Mint;
  symbol: string;
  scenario: Scenario;
  t: number;               // sim seconds since launch
  life: number;
  curve: CurveState;
  dev: Wallet;
  cluster: Wallet[];
  bal: Map<Wallet, number>;
  order: Wallet[];         // first-buy order, for "early holders sell" behaviour
  peakAt: number;
  rugAt: number;
  rugged: boolean;
  done: boolean;
}

const FEE_BPS = 100;
const FEE = FEE_BPS / 10_000;
const GRAD_NATIVE = 115;   // virtual native reserves at which the curve "graduates"
const TICK_MS = 250;
const KEEP_DONE = 300;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const addr = () => Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const SYL = ["moo", "pep", "dog", "wif", "bon", "zap", "kek", "gig", "sol", "rob", "fro", "tur", "bo", "chad", "nya", "lol", "pon", "hood"];
const symbol = () => (pick(SYL) + pick(SYL) + (Math.random() < 0.3 ? pick(SYL) : "")).toUpperCase().slice(0, 9);
const lognormal = (median: number, sigma: number) => {
  const u = 1 - Math.random(), v = Math.random();
  return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
};

export class SimLaunchpad implements Launchpad {
  name = "sim";
  chain = "sim" as const;
  totalSupply = 1_000_000_000;

  settings = {
    launchesPerMin: 6,
    speed: 1,
    weights: { pump: 2, rug: 3, bleed: 3, bundled: 1, serial: 1, dud: 2 } as Record<Scenario, number>,
  };
  running = false;

  private timer?: NodeJS.Timeout;
  private toks = new Map<Mint, SimToken>();
  private block = 1;
  private launchAcc = 0.8; // first launch comes quickly

  truth(mint: Mint) { return this.toks.get(mint)?.scenario; }
  liveCount() { let n = 0; for (const t of this.toks.values()) if (!t.done) n++; return n; }

  async start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  async stop() {
    this.running = false;
    clearInterval(this.timer);
  }
  reset() { this.toks.clear(); this.launchAcc = 0.8; }

  /** Spawn one launch now, optionally forcing the scenario. */
  launchNow(scenario?: Scenario) { this.launch(scenario ?? this.pickScenario()); }

  // ---- Launchpad interface ----
  async getCurve(mint: Mint) {
    const t = this.toks.get(mint);
    if (!t) throw new Error(`unknown sim token ${mint}`);
    return { ...t.curve };
  }
  quoteBuy(c: CurveState, n: number) { return cp.buy(c, n, FEE_BPS); }
  quoteSell(c: CurveState, t: number) { return cp.sell(c, t, FEE_BPS); }
  price(c: CurveState) { return cp.price(c); }
  mcapNative(c: CurveState) { return cp.price(c) * this.totalSupply; }
  async buy(): Promise<Fill> { throw new Error("sim launchpad is paper-only"); }
  async sell(): Promise<Fill> { throw new Error("sim launchpad is paper-only"); }

  /** Bot's paper fills move the sim curve (price impact is real) but aren't broadcast as trades. */
  paperFill(mint: Mint, side: "buy" | "sell", amount: number): Fill {
    const t = this.toks.get(mint);
    if (!t) throw new Error(`unknown sim token ${mint}`);
    const r = side === "buy" ? this.applyBuy(t.curve, amount) : this.applySell(t.curve, amount);
    return { tx: `sim-${addr().slice(0, 12)}`, tokens: r.tokens, native: r.native, ts: Date.now() };
  }

  // ---- generator ----
  private tick() {
    const dt = (TICK_MS / 1000) * this.settings.speed;
    this.block++;
    this.launchAcc += (this.settings.launchesPerMin / 60) * dt * rand(0.3, 1.7);
    while (this.launchAcc >= 1) { this.launchAcc--; this.launch(this.pickScenario()); }
    for (const t of this.toks.values()) if (!t.done) this.step(t, dt);
    if (this.toks.size > KEEP_DONE) {
      for (const [k, t] of this.toks) { if (t.done) { this.toks.delete(k); break; } }
    }
  }

  private pickScenario(): Scenario {
    const w = Object.entries(this.settings.weights) as [Scenario, number][];
    let r = Math.random() * w.reduce((a, [, x]) => a + Math.max(0, x), 0);
    for (const [s, x] of w) { r -= Math.max(0, x); if (r <= 0) return s; }
    return "dud";
  }

  private launch(scenario: Scenario) {
    const peakAt = rand(25, 70);
    const rugAt = rand(15, 45);
    const life = scenario === "pump" ? peakAt + rand(60, 120)
      : scenario === "bleed" ? rand(90, 150)
      : scenario === "dud" ? rand(25, 50)
      : rugAt + rand(20, 50);
    const t: SimToken = {
      mint: addr(), symbol: symbol(), scenario, t: 0, life,
      curve: { virtualNativeReserves: 30, virtualTokenReserves: 1_073_000_000, realNativeReserves: 0, complete: false },
      dev: addr(), cluster: [], bal: new Map(), order: [], peakAt, rugAt, rugged: false, done: false,
    };
    this.toks.set(t.mint, t);

    const insider = scenario === "rug" || scenario === "bundled" || scenario === "serial";
    if (insider) {
      t.cluster = Array.from({ length: Math.floor(rand(2, 5)) }, addr);
      // in reality these links come from funding traces; the sim hands them to intel directly
      for (const w of t.cluster) clusters.link("sim", w, t.dev);
    }
    if (scenario === "serial") intel.label("sim", t.dev, "serial_rugger");

    bus.emitTyped("launch", {
      mint: t.mint, chain: "sim", launchpad: "sim", creator: t.dev,
      name: t.symbol.toLowerCase(), symbol: t.symbol, createdBlock: this.block, createdAt: Date.now(),
    });

    // launch-block buys
    const devPct = scenario === "bundled" ? rand(3, 8) : rand(0, 5);
    if (devPct > 0.5) this.buyTokensPct(t, t.dev, devPct);
    if (scenario === "bundled") for (const w of t.cluster) this.buyTokensPct(t, w, rand(4, 8));
  }

  private step(t: SimToken, dt: number) {
    t.t += dt;
    if (t.t > t.life) { t.done = true; return; }

    const insider = t.cluster.length > 0;
    if (insider && !t.rugged && t.t >= t.rugAt) {
      t.rugged = true;
      for (const w of [t.dev, ...t.cluster]) {
        const b = t.bal.get(w) ?? 0;
        if (b > 0) this.trade(t, w, "sell", b);
      }
    }

    const { rate, pBuy, early } = this.phase(t);
    let n = Math.floor(rate * dt);
    if (Math.random() < rate * dt - n) n++;
    for (let i = 0; i < n && !t.done; i++) {
      if (Math.random() < pBuy) {
        const w = Math.random() < 0.75 || t.order.length === 0 ? addr() : pick(t.order);
        if (insider && !t.rugged && w === t.dev) continue;
        const size = Math.min(4, Math.max(0.02, lognormal(t.scenario === "dud" ? 0.15 : 0.4, 0.9)));
        this.trade(t, w, "buy", size);
      } else {
        const w = this.pickSeller(t, early);
        if (!w) continue;
        const b = t.bal.get(w)!;
        this.trade(t, w, "sell", Math.random() < 0.5 ? b : b * rand(0.3, 0.9));
      }
    }
  }

  private phase(t: SimToken) {
    switch (t.scenario) {
      case "pump":
        if (t.t < t.peakAt) return { rate: 3, pBuy: 0.75, early: 0.15 };
        if (t.t < t.peakAt + 25) return { rate: 3.5, pBuy: 0.48, early: 0.5 };
        return { rate: 2.5, pBuy: 0.22, early: 0.7 };
      case "rug": case "bundled": case "serial":
        return t.rugged ? { rate: 2, pBuy: 0.12, early: 0.5 } : { rate: 2.5, pBuy: 0.65, early: 0.2 };
      case "bleed": return { rate: 1.5, pBuy: 0.42, early: 0.3 };
      case "dud": return { rate: 0.4, pBuy: 0.5, early: 0.3 };
    }
  }

  private pickSeller(t: SimToken, earlyBias: number): Wallet | undefined {
    const blocked = (w: Wallet) => (w === t.dev || t.cluster.includes(w)) && !t.rugged;
    const holders = t.order.filter(w => (t.bal.get(w) ?? 0) > 1 && !blocked(w));
    if (!holders.length) return;
    if (Math.random() < earlyBias) return pick(holders.slice(0, Math.max(1, Math.ceil(holders.length * 0.3))));
    return pick(holders);
  }

  private buyTokensPct(t: SimToken, w: Wallet, pct: number) {
    const native = cp.nativeForTokens(t.curve, (pct / 100) * this.totalSupply) / (1 - FEE);
    this.trade(t, w, "buy", native);
  }

  private applyBuy(c: CurveState, nativeIn: number) {
    const tokens = cp.buy(c, nativeIn, FEE_BPS);
    const net = nativeIn * (1 - FEE);
    c.virtualNativeReserves += net; c.virtualTokenReserves -= tokens; c.realNativeReserves += net;
    return { tokens, native: nativeIn };
  }
  private applySell(c: CurveState, tokensIn: number) {
    const k = c.virtualNativeReserves * c.virtualTokenReserves;
    const gross = c.virtualNativeReserves - k / (c.virtualTokenReserves + tokensIn);
    c.virtualNativeReserves -= gross; c.virtualTokenReserves += tokensIn; c.realNativeReserves -= gross;
    return { tokens: tokensIn, native: gross * (1 - FEE) };
  }

  /** buy: amount = native in. sell: amount = tokens in. */
  private trade(t: SimToken, w: Wallet, side: "buy" | "sell", amount: number) {
    const r = side === "buy" ? this.applyBuy(t.curve, amount) : this.applySell(t.curve, Math.min(amount, t.bal.get(w) ?? 0));
    if (r.tokens <= 0) return;
    if (side === "buy") {
      if (!t.bal.has(w)) t.order.push(w);
      t.bal.set(w, (t.bal.get(w) ?? 0) + r.tokens);
    } else {
      t.bal.set(w, (t.bal.get(w) ?? 0) - r.tokens);
    }
    bus.emitTyped("trade", {
      mint: t.mint, wallet: w, side, nativeAmount: r.native, tokenAmount: r.tokens,
      block: this.block, ts: Date.now(), tx: addr(),
      virtualNativeReserves: t.curve.virtualNativeReserves, virtualTokenReserves: t.curve.virtualTokenReserves,
    });
    if (t.curve.virtualNativeReserves >= GRAD_NATIVE) { t.curve.complete = true; t.done = true; }
  }
}
