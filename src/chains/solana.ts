import { Connection } from "@solana/web3.js";
import { config } from "../config.js";

export const solConn = new Connection(config.chains.solana.rpcHttp, {
  wsEndpoint: config.chains.solana.rpcWs,
  commitment: "processed",
});
// TODO: loadKeypair(), sendWithJito(), confirm + parse fill from tx meta
