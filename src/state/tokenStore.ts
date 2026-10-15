import type { Mint, TokenLaunch, TradeEvent, Wallet, CurveState } from "../types.js";

export interface TokenState {
  launch: TokenLaunch;
  curve?: CurveState;
  trades: TradeEvent[];
  holders: Map<Wallet, number>;
  firstBuyers: Wallet[];
  athPrice: number;
  migrated: boolean;
}

const MAX_TRADES = 5_000;
const FIRST_BUYERS_N = 20;

// keyed by `${launchpad}:${mint}` so the same address can't collide across chains
export const key = (launchpad: string, mint: Mint) => `${launchpad}:${mint}`;

export class TokenStore {
  private tokens = new Map<string, TokenState>();
  private byMint = new Map<Mint, string>();

  onLaunch(l: TokenLaunch) {
    const k = key(l.launchpad, l.mint);
    this.tokens.set(k, { launch: l, trades: [], holders: new Map(), firstBuyers: [], athPrice: 0, migrated: false });
    this.byMint.set(l.mint, k);
  }

  onTrade(t: TradeEvent) {
    const s = this.get(t.mint);
    if (!s) return;
    s.trades.push(t);
    if (s.trades.length > MAX_TRADES) s.trades.shift();
    const delta = t.side === "buy" ? t.tokenAmount : -t.tokenAmount;
    s.holders.set(t.wallet, (s.holders.get(t.wallet) ?? 0) + delta);
    if (t.side === "buy" && s.firstBuyers.length < FIRST_BUYERS_N && !s.firstBuyers.includes(t.wallet)) {
      s.firstBuyers.push(t.wallet);
    }
    if (t.virtualNativeReserves && t.virtualTokenReserves) {
      s.curve = {
        realNativeReserves: s.curve?.realNativeReserves ?? 0,
        complete: s.curve?.complete ?? false,
        virtualNativeReserves: t.virtualNativeReserves,
        virtualTokenReserves: t.virtualTokenReserves,
      };
      s.athPrice = Math.max(s.athPrice, t.virtualNativeReserves / t.virtualTokenReserves);
    }
  }

  get(m: Mint) { const k = this.byMint.get(m); return k ? this.tokens.get(k) : undefined; }
  gc() { /* TODO: evict dead, unheld tokens */ }
  clear() { this.tokens.clear(); this.byMint.clear(); }
}
export const tokens = new TokenStore();
