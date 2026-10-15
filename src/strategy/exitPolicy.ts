import { config } from "../config.js";
import type { Decision, Position } from "../types.js";

/** Mechanical rules (stops, TP ladder, time) + signal score. Downside rules always win. */
export function decideExit(p: Position, price: number, exitScore: number): Decision {
  const e = config.exit;
  const mult = price / (p.costNative / p.tokens);
  const fromHigh = 1 - price / p.highWaterPrice;
  const ageSec = (Date.now() - p.openedAt) / 1000;

  if (mult <= 1 - e.hardStopPct / 100) return { action: "sell", fraction: 1, reason: `hard stop ${mult.toFixed(2)}x` };
  if (exitScore >= e.signalSellThreshold) return { action: "sell", fraction: 1, reason: `signal ${exitScore.toFixed(2)}` };
  if (ageSec > e.maxHoldSec) return { action: "sell", fraction: 1, reason: "time stop" };
  if (p.soldLevels.length > 0 && fromHigh * 100 >= e.trailingStopPct) {
    return { action: "sell", fraction: 1, reason: `trailing ${(fromHigh * 100).toFixed(0)}% off high` };
  }
  for (let i = 0; i < e.takeProfitLadder.length; i++) {
    const [lvl, frac] = e.takeProfitLadder[i];
    if (mult >= lvl && !p.soldLevels.includes(i)) return { action: "sell", fraction: frac, reason: `TP${i} @ ${lvl}x`, level: i };
  }
  // TODO: soft signal (0.4–0.7) -> partial sell / tighten trailing stop
  return { action: "hold" };
}
