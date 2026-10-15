import type { Launchpad } from "./launchpads/Launchpad.js";

// Lazy imports: a launchpad's chain client is only created if that launchpad is started,
// so the simulator runs without any RPC / env setup.
const registry: Record<string, () => Promise<Launchpad>> = {
  pumpfun: async () => new (await import("./launchpads/pumpfun.js")).PumpFun(),
  pons: async () => new (await import("./launchpads/pons.js")).Pons(),
  sim: async () => new (await import("./launchpads/sim.js")).SimLaunchpad(),
};

export const launchpads = new Map<string, Launchpad>();

export async function startIngest(names: readonly string[]) {
  for (const name of names) {
    const lp = await registry[name]();
    launchpads.set(name, lp);
    await lp.start();
  }
}
