/* Fixed regression budgets, not auto-ratcheted baselines or product acceptance.
   node build.mjs && corepack pnpm --filter @docforge/web build
   node qa/budgets.mjs                   # measured current-regression limits
   node qa/budgets.mjs --strict-targets  # also enforce 300 KB / 7 MB (decimal)

   2026-10-16, Node 24.11.1, Chromium measurements:
     classic HTML: 7,192,011 raw bytes (latest classic-only rebuild)
   Last successful full web build:
     studio boot JS: 781,128 gzip bytes (cold context, through preview + idle)
     .next/static JS: 1,783,449 gzip bytes (includes lazy chunks)
   HTML script tags alone undercount this ssr:false studio by ~600 KB gzip.
   Each distinct requested script is gzipped independently at level 9. Prefetches
   during boot count conservatively; import/export user actions are not invoked. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { launch } from "./_browser.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WEB = resolve(ROOT, "apps/web");
const NEXT = resolve(WEB, ".next");
const REPORT = resolve(ROOT, "qa/out/budgets.json");
export const LIMITS = { classicRaw: 7_400_000, studioBootGzip: 820_000, allClientJsGzip: 1_850_000 };
export const TARGETS = { classicRaw: 7_000_000, studioBootGzip: 300_000 };

export function checkLimits(metrics, limits) {
  return Object.entries(limits).map(([metric, limit]) => ({
    metric, bytes: metrics[metric], limit,
    passed: Number.isFinite(metrics[metric]) && metrics[metric] > 0 && metrics[metric] <= limit,
  }));
}

function measure(path) {
  const bytes = readFileSync(path);
  if (!bytes.length) throw new Error(`Empty artifact: ${relative(ROOT, path)}`);
  return { path: relative(ROOT, path), raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
}

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? jsFiles(path) : /\.m?js$/.test(entry.name) ? [path] : [];
  }).sort();
}

async function studioBoot() {
  const reserve = createServer();
  await new Promise((done, reject) => { reserve.once("error", reject); reserve.listen(0, "127.0.0.1", done); });
  const port = reserve.address().port;
  await new Promise(done => reserve.close(done));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [resolve(WEB, "node_modules/next/dist/bin/next"),
    "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: WEB, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "", spawnError;
  server.on("error", error => { spawnError = error; });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", data => { log = (log + data).slice(-8000); });
  }
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError || server.exitCode !== null) throw new Error(`Next failed to start: ${spawnError ?? log}`);
      try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* starting */ }
      if (ready) break;
      await new Promise(done => setTimeout(done, 200));
    }
    if (!ready) throw new Error(`Next startup timed out: ${log}`);
    browser = await launch();
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const scripts = new Set(), errors = [];
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      errors.push(`unexpected external request: ${route.request().url()}`);
      return route.abort();
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (request.resourceType() === "script") scripts.add(request.url());
    });
    page.on("response", response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.goto(`${origin}/studio`, { timeout: 30_000 });
    await page.waitForSelector(".pagedjs_page", { timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
    if (errors.length) throw new Error(`Cannot measure a healthy studio: ${errors.join("; ")}`);
    if (!scripts.size) throw new Error("Studio loaded no scripts");
    return [...scripts].sort().map(url => {
      const parsed = new URL(url);
      if (parsed.origin !== origin) throw new Error(`Unmeasurable script: ${url}`);
      const base = parsed.pathname.startsWith("/_next/") ? NEXT : resolve(WEB, "public");
      const path = resolve(base, decodeURIComponent(parsed.pathname.replace(/^\/_next\//, "").replace(/^\//, "")));
      if (!path.startsWith(base + sep)) throw new Error(`Invalid script path: ${url}`);
      return measure(path);
    });
  } finally {
    try { if (browser) await browser.close(); } finally {
      if (server.pid && server.exitCode === null) {
        const stopped = once(server, "exit");
        server.kill("SIGTERM");
        const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
        try { await stopped; } finally { clearTimeout(timer); }
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--strict-targets")) {
    throw new Error("Usage: node qa/budgets.mjs [--strict-targets]");
  }
  mkdirSync(resolve(ROOT, "qa/out"), { recursive: true });
  rmSync(REPORT, { force: true });
  try {
    // Fail closed on an absent/partial build, even if other artifacts remain.
    if (!readFileSync(resolve(NEXT, "BUILD_ID"), "utf8").trim()) throw new Error("Missing production build ID");
    const classic = measure(resolve(ROOT, "dist/DocForge.html"));
    const client = jsFiles(resolve(NEXT, "static")).map(measure);
    if (!client.length) throw new Error("No emitted client JS — build the web app first");
    const studio = await studioBoot();
    const metrics = {
      classicRaw: classic.raw,
      studioBootGzip: studio.reduce((n, file) => n + file.gzip, 0),
      allClientJsGzip: client.reduce((n, file) => n + file.gzip, 0),
    };
    const regression = checkLimits(metrics, LIMITS), targets = checkLimits(metrics, TARGETS);
    const passed = regression.every(check => check.passed) && (!args.length || targets.every(check => check.passed));
    writeFileSync(REPORT, JSON.stringify({ passed, node: process.version, metrics, regression,
      productTargets: targets, strictTargets: !!args.length, classic, studio, client }, null, 2) + "\n");
    for (const check of regression) {
      console.log(`${check.passed ? "PASS" : "FAIL"} ${check.metric}: ${check.bytes} / ${check.limit} bytes`);
    }
    for (const check of targets) {
      console.log(`PRODUCT TARGET ${check.passed ? "MET" : "UNMET"}: ${check.metric} ${check.bytes} / ${check.limit} bytes`);
    }
    console.log("Evidence: qa/out/budgets.json (gzip level 9, per distinct file; MB = 1,000,000 bytes)");
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    writeFileSync(REPORT, JSON.stringify({ passed: false, error: error.message }, null, 2) + "\n");
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
