import { EventEmitter } from "node:events";
import type { TokenLaunch, TradeEvent } from "../types.js";

interface Events {
  launch: [TokenLaunch];
  trade: [TradeEvent];
  migrated: [string];
}
class Bus extends EventEmitter {
  emitTyped<K extends keyof Events>(k: K, ...a: Events[K]) { return this.emit(k, ...a); }
  onTyped<K extends keyof Events>(k: K, fn: (...a: Events[K]) => void) { return this.on(k, fn as any); }
}
export const bus = new Bus();
