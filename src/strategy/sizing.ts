import { config } from "../config.js";
import type { CurveState } from "../types.js";
import type { Launchpad } from "../ingest/launchpads/Launchpad.js";
import { cp } from "../ingest/launchpads/Launchpad.js";
import { nativeUsd } from "../util/prices.js";

/** Split target tokens into N native-currency tranches, walking the curve, capped in USD. */
export function planTranches(lp: Launchpad, curve: CurveState, targetTokens: number): number[] {
  const n = config.entry.tranches;
  const per = targetTokens / n;
  const out: number[] = [];
  let c = { ...curve };
  for (let i = 0; i < n; i++) {
    const native = cp.nativeForTokens(c, per); // TODO: use lp-specific inverse if curve isn't constant-product
    out.push(native);
    c = { ...c, virtualNativeReserves: c.virtualNativeReserves + native, virtualTokenReserves: c.virtualTokenReserves - per };
  }
  const total = out.reduce((a, b) => a + b, 0);
  const cap = config.entry.maxUsdPerToken / nativeUsd(lp.chain);
  return total > cap ? out.map(x => (x * cap) / total) : out;
}

/** TODO: scale by entry conviction. */
export function targetTokens(launchpad: string, conviction = 0.5) {
  const [lo, hi] = config.perLaunchpad[launchpad].targetTokens;
  return lo + (hi - lo) * conviction;
}
