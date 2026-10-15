import { createPublicClient, createWalletClient, defineChain, http, webSocket } from "viem";
import { config } from "../config.js";

const c = config.chains.rh;

export const robinhoodChain = defineChain({
  id: c.chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [c.rpcHttp], webSocket: [c.rpcWs] } },
});

export const rhPublic = createPublicClient({ chain: robinhoodChain, transport: webSocket(c.rpcWs) });
export const rhHttp   = createPublicClient({ chain: robinhoodChain, transport: http(c.rpcHttp) });

// TODO: load private key from c.privateKeyPath -> privateKeyToAccount
export const rhWallet = () => createWalletClient({ chain: robinhoodChain, transport: http(c.rpcHttp) });
