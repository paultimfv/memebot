// Builds dist/demo.html: the console page with the engine + simulator bundled in,
// so it runs entirely in the browser (no server, no chain, no keys).
//   npm run build:demo
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;

// Node-only modules the engine touches, replaced with browser stand-ins.
const stubs = {
  "dotenv/config": "export {};",
  "pino": "const n = () => {}; export default () => ({ debug: n, info: n, warn: n, error: n });",
  "node:events": `export class EventEmitter {
    constructor() { this._h = new Map(); }
    on(k, f) { (this._h.get(k) ?? this._h.set(k, []).get(k)).push(f); return this; }
    emit(k, ...a) { const l = this._h.get(k); if (!l) return false; for (const f of [...l]) f(...a); return true; }
    off(k, f) { const l = this._h.get(k); if (l) this._h.set(k, l.filter(x => x !== f)); return this; }
  }`,
};

const browserStubs = {
  name: "browser-stubs",
  setup(b) {
    b.onResolve({ filter: /^(dotenv\/config|pino|node:events)$/ }, a => ({ path: a.path, namespace: "stub" }));
    // real-chain adapters are never loaded in the demo; keep their SDKs out of the bundle
    b.onResolve({ filter: /launchpads\/(pumpfun|pons)\.js$/ }, a => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, a => ({ contents: stubs[a.path] ?? "export {};", loader: "js" }));
  },
};

const out = await build({
  entryPoints: [root + "src/web/demo.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  define: { "process.env": "{}" },
  plugins: [browserStubs],
  logLevel: "warning",
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// The artifact host supplies <!doctype>, <html>, <head>, <body>, charset and viewport,
// so emit only the page's own head bits + body content.
const html = readFileSync(root + "src/ui/index.html", "utf8");
const head = html.slice(html.indexOf("<title>"), html.indexOf("</head>"));
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
const page = `${head}\n<script>${js}</script>\n${body}`;

// dist/demo.html: fragment for the claude.ai artifact (host adds the document skeleton)
mkdirSync(root + "dist/site", { recursive: true });
writeFileSync(root + "dist/demo.html", page);

// dist/site/index.html: full standalone document for Vercel / any static host
const site = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="A memecoin sniping bot trading a simulated launchpad live in your browser.">
${head}
<script>${js}</script>
</head>
<body>${body}</body>
</html>`;
writeFileSync(root + "dist/site/index.html", site);
console.log(`dist/demo.html  ${(page.length / 1024).toFixed(0)} KB`);
console.log(`dist/site/index.html  ${(site.length / 1024).toFixed(0)} KB`);
