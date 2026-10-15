import type { Executor } from "./executor.js";
import type { Fill } from "../types.js";
import { launchpads } from "../ingest/index.js";
import { tokens } from "../state/tokenStore.js";

const LATENCY_MS: Record<string, number> = { solana: 400, rh: 300, sim: 300 };

/** Fills against live curve state after simulated latency. Default mode, works for every launchpad. */
export class PaperExecutor implements Executor {
  private async prep(lp: string, mint: string) {
    const a = launchpads.get(lp)!;
    await new Promise(r => setTimeout(r, LATENCY_MS[a.chain] ?? 400)); // price moves while "landing"
    return a;
  }
  async buy(lp: string, mint: string, nativeIn: number): Promise<Fill> {
    const a = await this.prep(lp, mint);
    if (a.paperFill) return a.paperFill(mint, "buy", nativeIn);
    const c = tokens.get(mint)?.curve;
    if (!c) throw new Error(`no curve for ${mint}`);
    return { tx: `paper-${Date.now()}`, tokens: a.quoteBuy(c, nativeIn), native: nativeIn, ts: Date.now() };
  }
  async sell(lp: string, mint: string, t: number): Promise<Fill> {
    const a = await this.prep(lp, mint);
    if (a.paperFill) return a.paperFill(mint, "sell", t);
    const c = tokens.get(mint)?.curve;
    if (!c) throw new Error(`no curve for ${mint}`);
    return { tx: `paper-${Date.now()}`, tokens: t, native: a.quoteSell(c, t), ts: Date.now() };
  }
}
