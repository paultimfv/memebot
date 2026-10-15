import type { Launchpad } from "./Launchpad.js";
import { cp } from "./Launchpad.js";
import type { CurveState, Fill, Mint } from "../../types.js";
import { solConn } from "../../chains/solana.js";

const FEE_BPS = 100; // TODO: read from global account; pump fee tiers change

export class PumpFun implements Launchpad {
  name = "pumpfun";
  chain = "solana" as const;
  totalSupply = 1_000_000_000;
  programId = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

  async start() {
    void solConn;
    // TODO: Geyser (preferred) or solConn.onLogs(programId)
    //  - Create event   -> bus "launch"
    //  - Trade event    -> bus "trade" (includes post-trade virtual reserves)
    //  - Complete event -> bus "migrated"
  }
  async stop() {}

  async getCurve(_mint: Mint): Promise<CurveState> {
    // TODO: PDA ["bonding-curve", mint] -> fetch + decode
    throw new Error("not implemented");
  }

  quoteBuy(c: CurveState, n: number) { return cp.buy(c, n, FEE_BPS); }
  quoteSell(c: CurveState, t: number) { return cp.sell(c, t, FEE_BPS); }
  price(c: CurveState) { return cp.price(c); }
  mcapNative(c: CurveState) { return cp.price(c) * this.totalSupply; }

  async buy(_m: Mint, _n: number, _min: number): Promise<Fill> {
    // TODO: idempotent ATA + pump buy ix, priority fee, Jito bundle, parse fill
    throw new Error("not implemented");
  }
  async sell(_m: Mint, _t: number, _min: number): Promise<Fill> { throw new Error("not implemented"); }
}
