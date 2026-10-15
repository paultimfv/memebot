import { config } from "./config.js";
import { log } from "./util/log.js";
import { startPriceFeed } from "./util/prices.js";
import { startIngest } from "./ingest/index.js";
import { initEngine } from "./engine.js";

log.info({ mode: config.mode, launchpads: config.launchpads }, "memebot starting");
initEngine(config.mode);
startPriceFeed();
await startIngest(config.launchpads);
