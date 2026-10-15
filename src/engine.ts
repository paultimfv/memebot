import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { log } from "./util/log.js";
import { bus } from "./util/bus.js";
import { nativeUsd } from "./util/prices.js";
import { launchpads } from "./ingest/index.js";
import { tokens } from "./state/tokenStore.js";
import { evaluateEntry } from "./strategy/entry.js";
import { planTranches, targetTokens } from "./strategy/sizing.js";
import { computeExitScore } from "./strategy/exitSignals.js";
import { decideExit } from "./strategy/exitPolicy.js";
import { risk } from "./risk/riskManager.js";
import { PaperExecutor } from "./exec/paper.js";
import { LiveExecutor } from "./exec/live.js";
import type { Executor } from "./exec/executor.js";
import type { ChainId, ExitSignal, Position, TokenLaunch, TradeEvent } from "./types.js";

/** The bot's brain: entry -> tranche buys -> exit loop. Shared by the CLI (index.ts) and the UI server. */

export type LaunchStatus = "watching" | "rejected" | "blocked" | "entered";
export interface LaunchView { launch: TokenLaunch; status: LaunchStatus; reasons: string[] }
export interface PosMeta {
  score: number;
  signals: ExitSignal[];
  prices: [number, number][];  // [ts, price]
  entryPrice: number;
  costTotal: number;           // native spent over the position's life
  outTotal: number;            // native received over the position's life
}
export interface ClosedTrade {
  mint: string; symbol: string; launchpad: string; chain: ChainId;
  openedAt: number; closedAt: number; costNative: number; outNative: number; pnlUsd: number; reason: string;
}
export interface LogEntry {
  ts: number;
  kind: "launch" | "reject" | "block" | "enter" | "buy" | "sell" | "close" | "info" | "error";
  msg: string;
  mint?: string;
}

export const events = new EventEmitter();
export const positions = new Map<string, Position>();
export const meta = new Map<string, PosMeta>();
export const launches = new Map<string, LaunchView>();
export const closed: ClosedTrade[] = [];
export const totals = { realizedUsd: 0, wins: 0, losses: 0, launches: 0, entered: 0, rejected: 0 };

const MAX_LAUNCHES = 200;
const MAX_CLOSED = 200;
const entering = new Set<string>();
let exec: Executor;
let started = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const sym = (mint: string) => tokens.get(mint)?.launch.symbol ?? mint.slice(0, 6);
const usd = (n: number) => `${n < 0 ? "-" : "+"}$${Math.abs(n).toFixed(2)}`;

function emit(kind: LogEntry["kind"], msg: string, mint?: string) {
  const e: LogEntry = { ts: Date.now(), kind, msg, mint };
  events.emit("log", e);
  log.debug(e);
}

export function initEngine(mode: "paper" | "live" = config.mode) {
  if (started) return;
  started = true;
  exec = mode === "live" ? new LiveExecutor() : new PaperExecutor();
  bus.onTyped("launch", onLaunch);
  bus.onTyped("trade", t => void onTrade(t));
  // time-based exits (time stop, trailing) must fire even if a token stops trading
  setInterval(() => { for (const p of positions.values()) void evaluate(p); }, 1_000);
}

function onLaunch(l: TokenLaunch) {
  tokens.onLaunch(l);
  launches.set(l.mint, { launch: l, status: "watching", reasons: [] });
  if (launches.size > MAX_LAUNCHES) launches.delete(launches.keys().next().value!);
  totals.launches++;
  emit("launch", `${l.symbol} launched on ${l.launchpad}`, l.mint);
}

async function onTrade(t: TradeEvent) {
  tokens.onTrade(t);
  const pos = positions.get(t.mint);
  if (pos) return evaluate(pos);
  const v = launches.get(t.mint);
  if (v && (v.status === "watching" || v.status === "blocked") && !entering.has(t.mint)) await maybeEnter(t.mint);
}

async function maybeEnter(mint: string) {
  entering.add(mint);
  try {
    const s = tokens.get(mint);
    const v = launches.get(mint);
    if (!s?.curve || !v) return;
    const lp = launchpads.get(s.launch.launchpad)!;
    const px = nativeUsd(lp.chain);

    const verdict = await evaluateEntry(s, lp.mcapNative(s.curve) * px, lp.totalSupply);
    if (!verdict.ok) {
      v.status = "rejected"; v.reasons = verdict.reasons; totals.rejected++;
      emit("reject", `${s.launch.symbol} skipped: ${verdict.reasons.join(", ")}`, mint);
      return;
    }

    const tranches = planTranches(lp, s.curve, targetTokens(lp.name));
    const needUsd = tranches.reduce((a, b) => a + b, 0) * px;
    const gate = risk.canOpen([...positions.values()], needUsd);
    if (!gate.ok) {
      if (v.status !== "blocked") emit("block", `${s.launch.symbol} blocked by risk: ${gate.reason}`, mint);
      v.status = "blocked"; v.reasons = [gate.reason!];
      return;
    }

    const pos: Position = {
      mint, chain: lp.chain, launchpad: lp.name,
      tokens: 0, costNative: 0, openedAt: Date.now(), highWaterPrice: 0, soldLevels: [], status: "building",
    };
    const m: PosMeta = { score: 0, signals: [], prices: [], entryPrice: 0, costTotal: 0, outTotal: 0 };
    positions.set(mint, pos);
    meta.set(mint, m);
    v.status = "entered"; v.reasons = []; totals.entered++;
    emit("enter", `${s.launch.symbol} entering: ${tranches.length} buys, ~$${needUsd.toFixed(2)}`, mint);

    for (let i = 0; i < tranches.length; i++) {
      if (pos.status !== "building") break;
      if (i > 0) {
        // stop adding if the exit side already says get out
        const { score } = await computeExitScore(s, pos);
        if (score >= config.exit.signalSellThreshold) { emit("info", `${s.launch.symbol} stopped buying: exit score ${score.toFixed(2)}`, mint); break; }
      }
      try {
        const f = await exec.buy(lp.name, mint, tranches[i]);
        pos.tokens += f.tokens; pos.costNative += f.native; m.costTotal += f.native;
        emit("buy", `${s.launch.symbol} buy ${i + 1}/${tranches.length}: ${(f.tokens / 1e6).toFixed(2)}M for ${f.native.toFixed(4)}`, mint);
      } catch (e) {
        emit("error", `${s.launch.symbol} buy failed: ${(e as Error).message}`, mint);
        break;
      }
      if (i < tranches.length - 1) await sleep(config.entry.trancheIntervalMs);
    }

    if (pos.tokens <= 0) { positions.delete(mint); meta.delete(mint); return; }
    pos.highWaterPrice = m.entryPrice = pos.costNative / pos.tokens;
    pos.status = "open";
  } finally {
    entering.delete(mint);
  }
}

async function evaluate(pos: Position) {
  const s = tokens.get(pos.mint);
  const m = meta.get(pos.mint);
  if (!s?.curve || !m) return;
  const lp = launchpads.get(pos.launchpad)!;
  const price = lp.price(s.curve);

  const last = m.prices.at(-1);
  if (!last || last[1] !== price || Date.now() - last[0] > 2_000) {
    m.prices.push([Date.now(), price]);
    if (m.prices.length > 400) m.prices.shift();
  }
  if (pos.status !== "open") return;
  pos.highWaterPrice = Math.max(pos.highWaterPrice, price);

  const { score, signals } = await computeExitScore(s, pos);
  m.score = score; m.signals = signals;
  if (pos.status !== "open") return;

  const d = decideExit(pos, price, score);
  if (d.action === "sell") await sellPosition(pos, d.fraction, d.reason, d.level);
}

export async function sellPosition(pos: Position, fraction: number, reason: string, level?: number) {
  if (pos.status !== "open") return false;
  pos.status = "closing";
  const m = meta.get(pos.mint)!;
  const name = sym(pos.mint);
  try {
    const qty = pos.tokens * fraction;
    const f = await exec.sell(pos.launchpad, pos.mint, qty);
    const costPortion = pos.costNative * fraction;
    const pnlUsd = (f.native - costPortion) * nativeUsd(pos.chain);
    risk.recordPnl(pnlUsd);
    totals.realizedUsd += pnlUsd;
    m.outTotal += f.native;
    pos.tokens -= qty; pos.costNative -= costPortion;
    if (level !== undefined) pos.soldLevels.push(level);
    emit("sell", `${name} sold ${(fraction * 100).toFixed(0)}% (${reason}): ${f.native.toFixed(4)} out, ${usd(pnlUsd)}`, pos.mint);
    if (risk.killed) emit("info", "daily loss limit hit, kill switch on");

    if (fraction >= 0.999 || pos.tokens < 1) {
      const px = nativeUsd(pos.chain);
      const total = (m.outTotal - m.costTotal) * px;
      closed.unshift({
        mint: pos.mint, symbol: name, launchpad: pos.launchpad, chain: pos.chain,
        openedAt: pos.openedAt, closedAt: Date.now(), costNative: m.costTotal, outNative: m.outTotal, pnlUsd: total, reason,
      });
      if (closed.length > MAX_CLOSED) closed.pop();
      total >= 0 ? totals.wins++ : totals.losses++;
      pos.status = "closed";
      positions.delete(pos.mint);
      meta.delete(pos.mint);
      emit("close", `${name} closed ${usd(total)} (${(m.outTotal / m.costTotal).toFixed(2)}x)`, pos.mint);
    } else {
      pos.status = "open";
    }
    return true;
  } catch (e) {
    pos.status = "open";
    emit("error", `${name} sell failed: ${(e as Error).message}`, pos.mint);
    return false;
  }
}

export async function manualSell(mint: string, fraction: number) {
  const pos = positions.get(mint);
  return pos ? sellPosition(pos, fraction, "manual") : false;
}

export async function sellAll(reason = "sell all") {
  await Promise.all([...positions.values()].map(p => sellPosition(p, 1, reason)));
}

export function setKill(on: boolean) {
  risk.killed = on;
  emit("info", on ? "kill switch ON: no new entries" : "kill switch off");
}

export function resetEngine() {
  positions.clear(); meta.clear(); launches.clear(); closed.length = 0;
  Object.assign(totals, { realizedUsd: 0, wins: 0, losses: 0, launches: 0, entered: 0, rejected: 0 });
  tokens.clear();
  risk.reset();
  emit("info", "reset");
}
