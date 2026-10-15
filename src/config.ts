import "dotenv/config";
import type { ChainId } from "./types.js";

export const config = {
  mode: (process.env.MODE ?? "paper") as "paper" | "live",

  chains: {
    solana: {
      rpcHttp: process.env.SOL_RPC_HTTP!,
      rpcWs: process.env.SOL_RPC_WS!,
      geyser: process.env.SOL_GEYSER_GRPC || undefined,
      keypairPath: process.env.SOL_KEYPAIR_PATH!,
    },
    rh: {
      chainId: Number(process.env.RH_CHAIN_ID),
      rpcHttp: process.env.RH_RPC_HTTP!,
      rpcWs: process.env.RH_RPC_WS!,
      privateKeyPath: process.env.RH_PRIVATE_KEY_PATH!,
    },
    sim: {},                   // offline simulator, no RPC
  } satisfies Record<ChainId, unknown>,

  // which launchpads to run
  launchpads: ["pumpfun", "pons"] as const,

  // shared strategy settings (USD so they mean the same thing on both chains)
  entry: {
    maxMcapUsd: 8_000,
    maxAgeSec: 60,
    tranches: 4,
    trancheIntervalMs: 1_500,
    maxUsdPerToken: 40,
  },

  // per-launchpad overrides: token targets, slippage, supply-relative filters
  perLaunchpad: {
    pumpfun: { targetTokens: [1_000_000, 10_000_000], slippageBps: 1_500 },
    pons:    { targetTokens: [1_000_000, 10_000_000], slippageBps: 1_500 }, // TODO: confirm PONS total supply
    sim:     { targetTokens: [1_000_000, 10_000_000], slippageBps: 1_500 },
  } as Record<string, { targetTokens: [number, number]; slippageBps: number }>,

  filters: {
    maxDevHoldPct: 10,
    maxBundledPct: 15,
    minUniqueBuyers: 0,
    blockFreshFundedDev: true,
    denyListPath: "./data/deny-wallets.json",
  },

  exit: {
    takeProfitLadder: [[2, 0.25], [4, 0.25], [8, 0.25]] as [number, number][],
    trailingStopPct: 35,
    hardStopPct: 50,
    maxHoldSec: 15 * 60,
    signalSellThreshold: 0.7,
  },

  risk: {                      // USD, across both chains
    maxConcurrentPositions: 5,
    maxDailyLossUsd: 300,
    maxOpenExposureUsd: 200,
  },

  exec: {
    solana: { priorityFeeMicroLamports: 200_000, jitoTipLamports: 100_000, useJito: true },
    rh:     { maxPriorityFeeGwei: 0.05, gasLimitBuffer: 1.2 },  // Arbitrum-Orbit style L2
    maxRetries: 2,
  },
};
