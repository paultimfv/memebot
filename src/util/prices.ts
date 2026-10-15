import type { ChainId } from "../types.js";

/** Native-token USD prices (SOL, ETH). TODO: poll a feed every ~30s. */
const px: Record<ChainId, number> = { solana: 150, rh: 3_000, sim: 150 };
export const nativeUsd = (c: ChainId) => px[c];
export function startPriceFeed() { /* TODO */ }
