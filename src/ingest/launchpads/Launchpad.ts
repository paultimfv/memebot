import type { ChainId, CurveState, Fill, Mint } from "../../types.js";

/**
 * One adapter per launchpad. Each adapter owns its chain client, so nothing
 * above this layer knows whether it's Solana or EVM.
 */
export interface Launchpad {
  name: string;
  chain: ChainId;
  totalSupply: number;

  /** Subscribe to creates + trades + graduation, push onto the bus. */
  start(): Promise<void>;
  stop(): Promise<void>;

  getCurve(mint: Mint): Promise<CurveState>;

  /** Pure math, no RPC — used for sizing and paper fills. */
  quoteBuy(c: CurveState, nativeIn: number): number;
  quoteSell(c: CurveState, tokensIn: number): number;
  price(c: CurveState): number;          // native per token
  mcapNative(c: CurveState): number;

  /** Real execution on this launchpad's chain. */
  buy(mint: Mint, nativeIn: number, minTokensOut: number): Promise<Fill>;
  sell(mint: Mint, tokensIn: number, minNativeOut: number): Promise<Fill>;

  /** Optional: simulated launchpads apply paper fills to their own curve. */
  paperFill?(mint: Mint, side: "buy" | "sell", amount: number): Fill;
}

/** Shared constant-product helpers (x*y=k on virtual reserves). */
export const cp = {
  buy(c: CurveState, nativeIn: number, feeBps: number) {
    const n = nativeIn * (1 - feeBps / 10_000);
    const k = c.virtualNativeReserves * c.virtualTokenReserves;
    return c.virtualTokenReserves - k / (c.virtualNativeReserves + n);
  },
  sell(c: CurveState, tokensIn: number, feeBps: number) {
    const k = c.virtualNativeReserves * c.virtualTokenReserves;
    return (c.virtualNativeReserves - k / (c.virtualTokenReserves + tokensIn)) * (1 - feeBps / 10_000);
  },
  price(c: CurveState) { return c.virtualNativeReserves / c.virtualTokenReserves; },
  nativeForTokens(c: CurveState, tokens: number) {
    const k = c.virtualNativeReserves * c.virtualTokenReserves;
    return k / (c.virtualTokenReserves - tokens) - c.virtualNativeReserves;
  },
};
