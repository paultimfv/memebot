# memebot

A bot for trading memecoins on launchpads in the first minute after launch. It buys at tiny market caps in small increments, building a position of 1 to 10 million tokens, then reads wallet and token activity to decide when to sell.

**[Live demo](https://memebot-zeta.vercel.app)**: the bot's real strategy code running against a simulated launchpad in your browser. No chain, no wallet, no money.

> Status: simulation only. The strategy, risk and execution layers are built and run end to end against the simulator. Live chain adapters (pump.fun on Solana, PONS on Robinhood Chain) are scaffolded and come next.

## How it works

```
launchpad adapter ─► event bus ─► token state (holders, trades, curve, first buyers)
                                       │
                  entry filters ◄──────┼──────► exit signals ─► exit policy
                        │                                            │
                  sizing (tranches) ─► risk limits ─► executor (paper | live)
```

**Entry.** A launch is skipped if the creator holds too much of the supply, wallets linked to the creator bought in the launch block (a bundle), the creator has rugged before, or the market cap or age is already past the limit. Otherwise the bot splits its buy into several small orders, walking the bonding curve so each one prices in the last.

**Exit.** Each signal scores sell pressure from 0 to 1, and a weighted total decides:

| Signal | Reads |
| --- | --- |
| `devSelling` | creator or linked wallets selling (forces a full exit) |
| `sniperCohortExiting` | share of the first 20 buyers who have sold out |
| `buySellPressure` | sell share of volume over the last 30s |
| `smartMoneyExiting`, `buyerVelocityDecay`, `holderConcentration`, `nearMigration` | stubbed, next up |

Mechanical rules sit on top: a take-profit ladder (2x, 4x, 8x), a trailing stop after the first take-profit, a hard stop and a time stop.

**Risk.** Max open positions, max capital deployed and a daily loss limit that halts new entries, all in USD across chains.

## Layout

```
src/
  engine.ts            entry -> buys -> exit loop, shared by every front end
  config.ts            all tunables
  ingest/launchpads/   one adapter per launchpad: pumpfun.ts, pons.ts, sim.ts
  chains/              Solana and Robinhood Chain clients
  strategy/            entry filters, sizing, exit signals, exit policy
  intel/               wallet profiles and funding clusters (straight from RPC)
  exec/                paper and live executors
  risk/                position, exposure and daily-loss limits
  ui/                  test console (local server + page)
  web/demo.ts          browser build of the engine for the hosted demo
```

## Run it

```bash
npm install
npm run ui            # local console at http://localhost:4747
npm run build:demo    # static demo -> dist/site/index.html
npm run typecheck
```

## Roadmap

1. Decode pump.fun create/trade events over Geyser or websocket, record a few days of launches.
2. Backfill wallet history and labels (creators, snipers, profitable wallets).
3. Replay recorded launches to tune the exit signal weights.
4. Paper trade against live data, then live trade with a small hot wallet.
5. PONS on Robinhood Chain: contract addresses and ABI, same adapter interface.
