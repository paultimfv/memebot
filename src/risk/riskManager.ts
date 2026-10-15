import { config } from "../config.js";
import type { Position } from "../types.js";
import { nativeUsd } from "../util/prices.js";

export class RiskManager {
  private realizedTodayUsd = 0;
  killed = false;

  canOpen(open: Position[], usdNeeded: number): { ok: boolean; reason?: string } {
    const r = config.risk;
    if (this.killed) return { ok: false, reason: "kill switch" };
    if (open.length >= r.maxConcurrentPositions) return { ok: false, reason: "max positions" };
    const exposure = open.reduce((a, p) => a + p.costNative * nativeUsd(p.chain), 0);
    if (exposure + usdNeeded > r.maxOpenExposureUsd) return { ok: false, reason: "max exposure" };
    if (-this.realizedTodayUsd >= r.maxDailyLossUsd) return { ok: false, reason: "daily loss limit" };
    return { ok: true };
  }

  recordPnl(usd: number) {
    this.realizedTodayUsd += usd;
    if (-this.realizedTodayUsd >= config.risk.maxDailyLossUsd) this.killed = true;
  }
  reset() { this.realizedTodayUsd = 0; this.killed = false; }
  // TODO: reset at UTC midnight; persist across restarts
}
export const risk = new RiskManager();
