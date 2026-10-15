import type { Executor } from "./executor.js";
import type { Fill } from "../types.js";
import { config } from "../config.js";
import { launchpads } from "../ingest/index.js";
import { tokens } from "../state/tokenStore.js";

/** Live execution: computes min-out from slippage, then hands off to the launchpad adapter. */
export class LiveExecutor implements Executor {
  async buy(lp: string, mint: string, nativeIn: number): Promise<Fill> {
    const a = launchpads.get(lp)!;
    const c = tokens.get(mint)?.curve ?? await a.getCurve(mint);
    const minOut = a.quoteBuy(c, nativeIn) * (1 - config.perLaunchpad[lp].slippageBps / 10_000);
    return a.buy(mint, nativeIn, minOut);
  }
  async sell(lp: string, mint: string, t: number): Promise<Fill> {
    const a = launchpads.get(lp)!;
    const c = tokens.get(mint)?.curve ?? await a.getCurve(mint);
    const minOut = a.quoteSell(c, t) * (1 - config.perLaunchpad[lp].slippageBps / 10_000);
    return a.sell(mint, t, minOut);
  }
}
