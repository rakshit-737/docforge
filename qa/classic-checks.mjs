/* Run the actual CONTRIBUTING UI suites, without trusting their exit codes alone.
   Build first: node build.mjs && node qa/classic-checks.mjs
   Local probe: node qa/classic-checks.mjs --only smoke,deep
   CI always runs the full portable list. Word interop is a separate explicit
   qa/borders.mjs --word invocation on a Windows/Office machine. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = resolve(ROOT, "qa/out/classic");
export const SUITES = [
  "smoke", "deep", "borders", "import-smoke", "manuscript-smoke", "cmdk-smoke",
  "convert-smoke", "firstrun-smoke", "font-smoke", "pdfedit-smoke",
  "run-styles-smoke", "proposal", "tier4", "run",
];
const ARTIFACTS = {
  deep: ["assignment.pdf", "assignment2.pdf", "assignment.docx", "letter.pdf"],
  proposal: ["proposal.pdf"],
  run: ["sample.pdf", "sample.docx"],
};

// Exported for focused harness checks without launching all browsers.
export function validateOutput(suite, output) {
  const problems = [];
  if (/^\s*(?:FAIL\b|FAILED\b|NO PAGES RENDERED\b|\[pageerror\])/im.test(output)
    || /\b[1-9]\d*\s+(?:failed\b|failure(?:\(s\)|s)?\b)/i.test(output)) {
    problems.push("suite logged a failure");
  }
  const requireMatch = (pattern, message) => {
    if (!pattern.test(output)) problems.push(message);
  };
  if (suite === "smoke") {
    requireMatch(/^smoke ok\s*$/m, "browser smoke did not complete");
  } else if (suite === "deep") {
    requireMatch(/^assignment pages: [1-9]\d*\s*$/m, "assignment has no pages");
    requireMatch(/^image attached in preview: true\s*$/m, "image attachment failed");
    requireMatch(/^source rewritten with img key: true\s*$/m, "image source key missing");
    requireMatch(/^assignment\.docx saved\s*$/m, "assignment export did not complete");
    requireMatch(/^errors: none\s*$/m, "deep suite reported browser errors or no error result");
    try {
      const restored = JSON.parse(output.match(/^after reload: (.+)$/m)?.[1] ?? "null");
      if (restored?.hasImg !== true || !restored.title?.trim()) {
        problems.push("autosave did not restore image and title");
      }
    } catch {
      problems.push("invalid autosave result");
    }
  } else if (suite === "run") {
    requireMatch(/^pages: [1-9]\d*\s*$/m, "quick pass has no pages");
    requireMatch(/^docx saved: .+\.docx\s*$/m, "quick pass did not export Word");
    requireMatch(/^console errors: none\s*$/m, "quick pass reported browser errors or no error result");
  } else if (suite !== "proposal") {
    requireMatch(/^PASS /m, "suite ran no assertions");
    requireMatch(/(?:\b[1-9]\d* passed, 0 failed\b|\bALL PASS\b|all font checks passed)/,
      "suite did not report a successful completion");
  }
  return problems;
}

function validateArtifacts(suite) {
  const problems = [];
  for (const name of ARTIFACTS[suite] ?? []) {
    const path = resolve(ROOT, "qa", name);
    try {
      const bytes = readFileSync(path);
      const valid = name.endsWith(".pdf")
        ? bytes.length > 5000 && bytes.subarray(0, 5).toString() === "%PDF-"
        : bytes.length > 15000 && bytes.readUInt32LE(0) === 0x04034b50;
      if (!valid) problems.push(`invalid export: qa/${name}`);
    } catch {
      problems.push(`missing export: qa/${name}`);
    }
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === "--only")) {
    throw new Error("Usage: node qa/classic-checks.mjs [--only suite,suite]");
  }
  if (args.length && process.env.CI && process.env.CI !== "false") {
    throw new Error("CI must run every classic suite; --only is local-only");
  }
  const suites = args.length ? args[1].split(",") : SUITES;
  if (!suites.length || suites.some(s => !SUITES.includes(s)) || new Set(suites).size !== suites.length) {
    throw new Error(`Unknown, empty, or duplicate suite. Available: ${SUITES.join(", ")}`);
  }
  mkdirSync(OUT, { recursive: true });
  const reportPath = resolve(OUT, "report.json");
  // Never leave a previous green report behind when preflight fails.
  rmSync(reportPath, { force: true });
  if (!existsSync(resolve(ROOT, "dist/DocForge.html"))) {
    throw new Error("dist/DocForge.html missing — run node build.mjs first");
  }
  for (const suite of suites) {
    if (!existsSync(resolve(ROOT, `qa/${suite}.mjs`))) throw new Error(`Missing suite: ${suite}`);
  }
  const report = { complete: false, fullSuite: !args.length, suites: [] };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  for (const suite of suites) {
    console.log(`\n=== classic: ${suite} ===`);
    for (const name of ARTIFACTS[suite] ?? []) rmSync(resolve(ROOT, "qa", name), { force: true });
    const started = Date.now();
    const result = spawnSync(process.execPath, [resolve(ROOT, `qa/${suite}.mjs`)], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      encoding: "utf8",
      timeout: 10 * 60 * 1000,
      killSignal: "SIGKILL",
      maxBuffer: 8 * 1024 * 1024,
      // A timed-out Chromium is in the same process group on POSIX; see cleanup.
      detached: process.platform !== "win32",
    });
    if (process.platform !== "win32" && result.pid) {
      try { process.kill(-result.pid, "SIGKILL"); } catch { /* already exited */ }
    }
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    process.stdout.write(output);
    writeFileSync(resolve(OUT, `${suite}.log`), output);
    const problems = validateOutput(suite, output);
    if (result.error) problems.push(result.error.message);
    if (result.status !== 0 || result.signal) {
      problems.push(`exit=${result.status}, signal=${result.signal ?? "none"}`);
    }
    problems.push(...validateArtifacts(suite));
    report.suites.push({ suite, passed: problems.length === 0, problems, durationMs: Date.now() - started });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`${problems.length ? "FAIL" : "PASS"} classic/${suite}${problems.length ? ": " + problems.join("; ") : ""}`);
  }
  report.complete = true;
  report.passed = report.suites.every(s => s.passed);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nClassic: ${report.suites.filter(s => s.passed).length}/${suites.length} passed; qa/out/classic/report.json`);
  process.exitCode = report.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
