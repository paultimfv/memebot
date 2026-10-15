import type { ExitSignal, Position } from "../types.js";
import type { TokenState } from "../state/tokenStore.js";
import { intel } from "../intel/walletIntel.js";
import { clusters } from "../intel/clusters.js";

/** Each signal returns 0..1 sell pressure. Chain-agnostic: works off TokenState only. */
type SignalFn = (s: TokenState, p: Position) => ExitSignal | Promise<ExitSignal>;

const WINDOW_MS = 30_000;
const recent = (s: TokenState) => s.trades.filter(t => t.ts > Date.now() - WINDOW_MS);

export const signals: Record<string, { weight: number; fn: SignalFn }> = {
  devSelling: { weight: 1.0, fn: (s) => {
    const { chain, creator } = s.launch;
    const sold = recent(s).filter(t => t.side === "sell" && (t.wallet === creator || clusters.sameCluster(chain, t.wallet, creator)));
    return { name: "devSelling", score: sold.length ? 1 : 0, reason: `${sold.length} dev/cluster sells` };
  }},

  sniperCohortExiting: { weight: 0.6, fn: (s) => {
    const exited = s.firstBuyers.filter(w => (s.holders.get(w) ?? 0) <= 0).length;
    const frac = s.firstBuyers.length ? exited / s.firstBuyers.length : 0;
    return { name: "sniperCohortExiting", score: frac, reason: `${(frac * 100).toFixed(0)}% of first buyers out` };
  }},

  smartMoneyExiting: { weight: 0.8, fn: async (s) => {
    void intel; void s; // TODO: sells by "smart"-labelled wallets in window
    return { name: "smartMoneyExiting", score: 0, reason: "todo" };
  }},

  buySellPressure: { weight: 0.5, fn: (s) => {
    const r = recent(s);
    const buy = r.filter(t => t.side === "buy").reduce((a, t) => a + t.nativeAmount, 0);
    const sell = r.filter(t => t.side === "sell").reduce((a, t) => a + t.nativeAmount, 0);
    const ratio = buy + sell === 0 ? 0.5 : sell / (buy + sell);
    return { name: "buySellPressure", score: Math.max(0, (ratio - 0.5) * 2), reason: `sell share ${(ratio * 100).toFixed(0)}%` };
  }},

  buyerVelocityDecay: { weight: 0.4, fn: () => ({ name: "buyerVelocityDecay", score: 0, reason: "todo" }) },
  holderConcentration: { weight: 0.3, fn: () => ({ name: "holderConcentration", score: 0, reason: "todo" }) },
  nearMigration: { weight: 0.3, fn: () => ({ name: "nearMigration", score: 0, reason: "todo" }) },
};

export async function computeExitScore(s: TokenState, p: Position) {
  const results = await Promise.all(Object.values(signals).map(async ({ weight, fn }) => ({ weight, sig: await fn(s, p) })));
  const totalW = results.reduce((a, r) => a + r.weight, 0);
  const hard = results.some(r => r.weight >= 1 && r.sig.score >= 1);
  const score = hard ? 1 : results.reduce((a, r) => a + r.weight * r.sig.score, 0) / totalW;
  return { score, signals: results.map(r => r.sig) };
}
