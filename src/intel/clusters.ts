import type { ChainId, Wallet } from "../types.js";

/** Union-find over wallets that share funding / move funds between each other. Per chain. */
export class ClusterGraph {
  private parent = new Map<string, string>();
  private k = (c: ChainId, w: Wallet) => `${c}:${w}`;

  private find(x: string): string {
    const p = this.parent.get(x);
    if (!p || p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r);
    return r;
  }
  link(c: ChainId, a: Wallet, b: Wallet) { this.parent.set(this.find(this.k(c, a)), this.find(this.k(c, b))); }
  sameCluster(c: ChainId, a: Wallet, b: Wallet) { return this.find(this.k(c, a)) === this.find(this.k(c, b)); }

  /** TODO: pull funding edges (SOL / ETH transfers) via RPC and link them. */
  async expand(_c: ChainId, _w: Wallet, _depth = 2) {}
}
export const clusters = new ClusterGraph();
