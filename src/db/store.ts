import Database from "better-sqlite3";

export const db = new Database("./data/memebot.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS launches (chain TEXT, launchpad TEXT, mint TEXT, creator TEXT, name TEXT, symbol TEXT, block INT, ts INT, PRIMARY KEY (launchpad, mint));
CREATE TABLE IF NOT EXISTS trades   (chain TEXT, tx TEXT, mint TEXT, wallet TEXT, side TEXT, native REAL, tokens REAL, vnative REAL, vtok REAL, block INT, ts INT, PRIMARY KEY (chain, tx, mint, wallet));
CREATE TABLE IF NOT EXISTS wallets  (chain TEXT, wallet TEXT, labels TEXT, funded_by TEXT, funded_at INT, stats_json TEXT, updated INT, PRIMARY KEY (chain, wallet));
CREATE TABLE IF NOT EXISTS positions(launchpad TEXT, mint TEXT, mode TEXT, tokens REAL, cost_native REAL, opened INT, closed INT, pnl_usd REAL, status TEXT, PRIMARY KEY (launchpad, mint, opened));
CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY, launchpad TEXT, mint TEXT, ts INT, kind TEXT, detail_json TEXT);
CREATE INDEX IF NOT EXISTS trades_mint_ts ON trades(mint, ts);
CREATE INDEX IF NOT EXISTS trades_wallet  ON trades(chain, wallet);
`);
// TODO: prepared insert helpers; batch trade inserts
