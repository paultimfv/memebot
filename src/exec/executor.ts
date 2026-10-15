import type { Fill, Mint } from "../types.js";

export interface Executor {
  buy(launchpad: string, mint: Mint, nativeIn: number): Promise<Fill>;
  sell(launchpad: string, mint: Mint, tokens: number): Promise<Fill>;
}
