import type { Address } from "viem";
import type { Launchpad } from "./Launchpad.js";
import { cp } from "./Launchpad.js";
import type { CurveState, Fill, Mint } from "../../types.js";
import { rhPublic, rhHttp, rhWallet } from "../../chains/rh.js";

/**
 * PONS launchpad on Robinhood Chain (EVM).
 *
 * TODO before this works — pull from the verified contracts / PONS docs:
 *  - factory + router addresses (set in .env)
 *  - real ABI for: token-created event, buy/sell events, curve reserves view, buy/sell fns
 *  - curve type: if not constant-product on virtual reserves, replace the cp.* math
 *  - fee bps, total supply, graduation threshold + where liquidity migrates
 */
const FACTORY = process.env.PONS_FACTORY_ADDRESS as Address;
const ROUTER = (process.env.PONS_ROUTER_ADDRESS || process.env.PONS_FACTORY_ADDRESS) as Address;
const FEE_BPS = 100;     // TODO: confirm

const ABI = [] as const;  // TODO: paste PONS factory/curve ABI here

export class Pons implements Launchpad {
  name = "pons";
  chain = "rh" as const;
  totalSupply = 1_000_000_000; // TODO: confirm

  private unwatch: (() => void)[] = [];

  async start() {
    void rhPublic; void FACTORY; void ABI;
    // TODO: rhPublic.watchContractEvent({ address: FACTORY, abi: ABI, eventName: <TokenCreated>, onLogs })
    //        -> bus "launch"  (createdBlock = log.blockNumber)
    // TODO: watch <Buy>/<Sell> (or Trade) events -> bus "trade"
    //        if events don't carry reserves, read them via getCurve() after each block
    // TODO: watch <Graduated>/<Migrated> -> bus "migrated"
    // Robinhood Chain is an L2 with fast blocks: prefer WS subscriptions, fall back to getLogs polling.
  }
  async stop() { this.unwatch.forEach(u => u()); }

  async getCurve(_mint: Mint): Promise<CurveState> {
    void rhHttp;
    // TODO: rhHttp.readContract({ address: <curve for mint>, abi: ABI, functionName: <reserves view> })
    throw new Error("not implemented");
  }

  quoteBuy(c: CurveState, n: number) { return cp.buy(c, n, FEE_BPS); }
  quoteSell(c: CurveState, t: number) { return cp.sell(c, t, FEE_BPS); }
  price(c: CurveState) { return cp.price(c); }
  mcapNative(c: CurveState) { return cp.price(c) * this.totalSupply; }

  async buy(_m: Mint, _ethIn: number, _minOut: number): Promise<Fill> {
    void rhWallet; void ROUTER;
    // TODO: simulateContract -> writeContract(buy, { value: parseEther(ethIn) })
    //       wait for receipt, parse Transfer/Buy log for actual tokens received
    throw new Error("not implemented");
  }
  async sell(_m: Mint, _t: number, _minOut: number): Promise<Fill> {
    // TODO: ensure ERC-20 approve(ROUTER) once per token (do it during buy to save time on exit)
    //       then writeContract(sell, [mint, amount, minOut])
    throw new Error("not implemented");
  }
}
