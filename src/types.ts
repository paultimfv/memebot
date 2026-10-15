export type ChainId = "solana" | "rh" | "sim";
export type Mint = string;     // token address (Solana mint or EVM ERC-20)
export type Wallet = string;

export interface TokenLaunch {
  mint: Mint;
  chain: ChainId;
  launchpad: string;
  creator: Wallet;
  name: string;
  symbol: string;
  uri?: string;
  createdBlock: number;        // slot on Solana, block number on EVM
  createdAt: number;           // ms
}

export interface TradeEvent {
  mint: Mint;
  wallet: Wallet;
  side: "buy" | "sell";
  nativeAmount: number;        // SOL or ETH
  tokenAmount: number;         // UI units
  block: number;
  ts: number;
  tx: string;
  virtualNativeReserves?: number;
  virtualTokenReserves?: number;
}

export interface CurveState {
  virtualNativeReserves: number;
  virtualTokenReserves: number;
  realNativeReserves: number;
  complete: boolean;           // graduated / migrated
}

export interface Position {
  mint: Mint;
  chain: ChainId;
  launchpad: string;
  tokens: number;
  costNative: number;
  openedAt: number;
  highWaterPrice: number;      // native per token
  soldLevels: number[];
  status: "building" | "open" | "closing" | "closed";
}

export interface ExitSignal { name: string; score: number; reason: string }

export type Decision =
  | { action: "hold" }
  | { action: "sell"; fraction: number; reason: string; level?: number };

export interface Fill { tx: string; tokens: number; native: number; ts: number }
