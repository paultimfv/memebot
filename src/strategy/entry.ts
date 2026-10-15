import { config } from "../config.js";
import type { TokenState } from "../state/tokenStore.js";
import { intel } from "../intel/walletIntel.js";
import { clusters } from "../intel/clusters.js";

export interface EntryVerdict { ok: boolean; reasons: string[] }

export async function evaluateEntry(s: TokenState, mcapUsd: number, totalSupply: number): Promise<EntryVerdict> {
  const reasons: string[] = [];
  const f = config.filters;
  const { chain, creator, createdAt, createdBlock } = s.launch;
  const pct = (t: number) => (t / totalSupply) * 100;
  const ageSec = (Date.now() - createdAt) / 1000;

  if (ageSec > config.entry.maxAgeSec) reasons.push(`too old ${ageSec.toFixed(0)}s`);
  if (mcapUsd > config.entry.maxMcapUsd) reasons.push(`mcap ${mcapUsd.toFixed(0)} > max`);

  const dev = await intel.profile(chain, creator);
  if (dev.labels.has("serial_rugger")) reasons.push("serial rugger dev");
  if (f.blockFreshFundedDev && dev.fundedAt && createdAt - dev.fundedAt < 10 * 60_000) reasons.push("dev freshly funded");

  const devPct = pct(s.holders.get(creator) ?? 0);
  if (devPct > f.maxDevHoldPct) reasons.push(`dev holds ${devPct.toFixed(1)}%`);

  // bundle check: launch-block buyers in dev's cluster
  const bundled = s.trades
    .filter(t => t.side === "buy" && t.block === createdBlock)
    .filter(t => t.wallet === creator || clusters.sameCluster(chain, t.wallet, creator))
    .reduce((a, t) => a + t.tokenAmount, 0);
  if (pct(bundled) > f.maxBundledPct) reasons.push(`bundled ${pct(bundled).toFixed(1)}%`);

  // TODO: metadata checks (socials, ticker dup of recent rug, image hash reuse)
  return { ok: reasons.length === 0, reasons };
}
