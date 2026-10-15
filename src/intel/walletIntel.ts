import type { ChainId, Wallet } from "../types.js";

export type WalletLabel =
  | "dev" | "dev_linked" | "bundler" | "sniper" | "smart" | "kol" | "serial_rugger" | "unknown";

export interface WalletProfile {
  wallet: Wallet;
  chain: ChainId;
  labels: Set<WalletLabel>;
  fundedBy?: Wallet;
  fundedAt?: number;
  launchesCreated?: number;
  rugRate?: number;
  avgHoldSec?: number;
  winRate?: number;
}

/**
 * Wallet profiles built straight from RPC + our own sqlite history. No Dune.
 *  - solana: getSignaturesForAddress + parsed txs
 *  - rh:     getLogs (ERC-20 Transfer + PONS events) by address; first inbound ETH via
 *            block scan / trace if the RPC supports it, else from our own recorded history
 */
export class WalletIntel {
  private cache = new Map<string, WalletProfile>();

  async profile(chain: ChainId, w: Wallet): Promise<WalletProfile> {
    const k = `${chain}:${w}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    // TODO: funding source, past creates/trades, rugRate / avgHoldSec / winRate
    const p: WalletProfile = { wallet: w, chain, labels: new Set(["unknown"]) };
    this.cache.set(k, p);
    return p;
  }

  label(chain: ChainId, w: Wallet, l: WalletLabel) {
    const k = `${chain}:${w}`;
    const p = this.cache.get(k) ?? { wallet: w, chain, labels: new Set<WalletLabel>() };
    p.labels.delete("unknown");
    p.labels.add(l);
    this.cache.set(k, p);
  }
}
export const intel = new WalletIntel();
