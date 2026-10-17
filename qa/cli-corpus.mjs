/* ============================================================
   Phase-5 gate — the CLI builds the golden corpus headlessly.

     corepack pnpm --filter @docforge/cli build && node qa/cli-corpus.mjs
     node qa/cli-corpus.mjs --pdf     # also print two docs through Chromium

   The claim Phase 5 makes for @docforge/cli is that the core is
   genuinely headless: every torture document in qa/golden/corpus
   converts with no browser and no studio. So convert all of them,
   and verify each result is a real OOXML package carrying the
   document part — not a zero-byte file, not an error page.
   ============================================================ */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const CLI = join(ROOT, "packages/cli/dist/cli.mjs");
const CORPUS = join(ROOT, "qa/golden/corpus");
const OUT = join(ROOT, "qa/out/cli-corpus");
const WITH_PDF = process.argv.includes("--pdf");

const fails = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) fails.push(name);
};

/* The zip's central directory holds every member name in plain bytes —
   enough to prove the package carries a document part without unpacking. */
const zipHas = (buf, member) => buf.includes(Buffer.from(member, "latin1"));

try {
  execFileSync(process.execPath, [CLI, "--help"], { stdio: "pipe" });
} catch {
  console.error("packages/cli/dist/cli.mjs missing — run: corepack pnpm --filter @docforge/cli build");
  process.exit(2);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const docs = readdirSync(CORPUS)
  .filter((f) => f.endsWith(".md"))
  .sort();
console.log(`converting ${docs.length} corpus documents…\n`);

let bytes = 0;
for (const doc of docs) {
  const stem = doc.replace(/\.md$/, "");
  try {
    execFileSync(process.execPath, [CLI, "build", join(CORPUS, doc), "--docx", "--out", OUT], {
      stdio: "pipe",
      timeout: 120000,
    });
  } catch (e) {
    check(`${stem} → docx`, false, String(e.stderr || e).slice(0, 120));
    continue;
  }
  const out = join(OUT, `${stem}.docx`);
  let buf;
  try {
    buf = readFileSync(out);
  } catch {
    check(`${stem} → docx`, false, "no output file");
    continue;
  }
  bytes += buf.length;
  const ok =
    buf.length > 2000 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b && // PK
    zipHas(buf, "word/document.xml") &&
    zipHas(buf, "[Content_Types].xml");
  check(`${stem} → docx`, ok, `${(buf.length / 1024).toFixed(0)} KB`);
}

if (WITH_PDF) {
  console.log("\nprinting two documents through headless Chromium…\n");
  for (const doc of ["14-long-mixed.md", "13-toc-pagebreaks.md"]) {
    const stem = doc.replace(/\.md$/, "");
    try {
      execFileSync(process.execPath, [CLI, "build", join(CORPUS, doc), "--pdf", "--out", OUT], {
        stdio: "pipe",
        timeout: 300000,
      });
    } catch (e) {
      check(`${stem} → pdf`, false, String(e.stderr || e).slice(0, 160));
      continue;
    }
    const buf = readFileSync(join(OUT, `${stem}.pdf`));
    check(
      `${stem} → pdf`,
      buf.subarray(0, 5).toString("latin1") === "%PDF-" && buf.length > 10000,
      `${(buf.length / 1024).toFixed(0)} KB`,
    );
  }
}

const produced = readdirSync(OUT).length;
check(`every corpus document produced a file (${produced}/${docs.length + (WITH_PDF ? 2 : 0)})`,
  produced === docs.length + (WITH_PDF ? 2 : 0));
console.log(`\n${(bytes / 1024 / 1024).toFixed(1)} MB of .docx written to qa/out/cli-corpus`);
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nCLI CORPUS GATE PASSES");
process.exit(fails.length ? 1 : 0);
