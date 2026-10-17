/* Phase-2 gate evidence: does the WEB studio's render path match the single-file edition?

   For a representative subset of the golden matrix this script:
     1. captures the classic dist/DocForge.html through the existing harness (capture.mjs),
     2. boots the Next.js studio (`corepack pnpm --filter @docforge/web start`), drives it
        through its REAL UI — the settings drawer and the CodeMirror source pane — for the
        same corpus documents and pinned settings,
      3. waits for compose, captures preview screenshots and a print-PDF raster, then clicks
         Export Word and captures the download, unzips + normalises it EXACTLY like capture.mjs,
      4. compares page counts, preview/PDF images, and every normalised word/*.xml member hash
         plus binary member hashes, quoting the first divergent XML lines when they differ.

   Results: qa/out/golden/web-parity/{classic,web}/ + qa/out/golden/web-parity-report.json
   and a printed table.

   Usage: node qa/golden/web-capture.mjs [--port 3211] [--only id1,id2] [--reuse-classic]

   This file is QA-only; it does not touch app code or the existing golden files. */
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../_browser.mjs";
import { rasterise } from "../_raster.mjs";
import { readZip } from "./_zip.mjs";
import { capture } from "./capture.mjs";
import { diffPng } from "./compare.mjs";
import { CASES } from "./matrix.mjs";
import { pageShot } from "./page-shot.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = join(ROOT, "qa", "out", "golden");
const PARITY = join(OUT, "web-parity");

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i === -1 ? d : argv[i + 1]; };
const has = n => argv.includes("--" + n);

const PORT = +arg("port", 3211);
const REUSE_CLASSIC = has("reuse-classic");

/* The FULL golden matrix (matrix.mjs order) — every case, including banner-plate:
   its postBaseline flag only exempts it from the frozen v1-classic baseline; here both
   sides are captured fresh from HEAD, so it must compare like any other case. */
const SUBSET = [
  "torture-modern-a4",
  "torture-academic-a4",
  "torture-executive-letter",
  "torture-minimal-a4-narrow",
  "border-rule-fine-ink",
  "border-double-medium-accent",
  "border-triple-bold-ink",
  "border-dashed-medium-ink",
  "border-dotted-fine-accent",
  "border-thickthin-medium-ink",
  "border-thinthick-bold-accent",
  "inline-marks",
  "span-attributes",
  "headings-sections",
  "tables",
  "tables-letter-justified",
  "figures",
  "footnotes",
  "citations-numeric",
  "citations-authoryear",
  "math",
  "code",
  "callouts-alignment",
  "lists-quotes",
  "toc-pagebreaks",
  "long-mixed",
  "edge-minimal",
  "adversarial",
  "cover-frontmatter",
  "fonts-embedded-pair",
  "fonts-word-catalog",
  "banner-plate",
  "type-large-loose",
  "type-small-single",
];
const only = arg("only", null)?.split(",") ?? CASES.map(c => c.id);
const cases = CASES.filter(c => only.includes(c.id));
if (!cases.length || only.some(id => !CASES.some(c => c.id === id))) {
  throw new Error("--only must name one or more known golden cases");
}

/* Mirror of the shared defaults contract (src/js/main.js DEFAULTS ≡ apps/web/lib/settings.ts
   defaultSettings). The web studio boots on the welcome TEMPLATE's settings, not the
   defaults, so every drawer control is driven to defaults ⊕ case — which is exactly the
   state the classic capture reaches (cleared localStorage defaults ⊕ case). `date` is
   always pinned by the matrix; `accent` is resolved below (theme re-inks it on both sides). */
const DEFAULTS = {
  title: "", subtitle: "", author: "", kicker: "", metaExtra: "",
  theme: "modern", page: "A4", orientation: "portrait", margins: "normal",
  cover: false, header: true, pageNums: true, numbered: false, justify: false, h1break: false,
  hardWrap: false, citeStyle: "ieee",
  borderStyle: "none", borderWeight: "medium", borderColor: "ink",
  fontHead: "theme", fontBody: "theme", baseSize: "11", lineSpacing: "default",
  headerLeft: "", headerRight: "", footerLeft: "", footerRight: "",
  watermark: "", letterhead: "", letterheadSize: "14",
};
const THEME_ACCENT = { modern: "#2563eb", executive: "#1f3a5f", academic: "#7f1d1d", minimal: "#111827" };

const sha = buf => createHash("sha256").update(buf).digest("hex");
const normXml = xml => xml.replace(/></g, ">\n<");
const SKIP_MEMBERS = /^docProps\//;
const XML_MEMBER = /\.(xml|rels)$/;

/* ---- copied verbatim from capture.mjs (not exported there) ---------------------------- */
function normaliseDocx(members) {
  const out = new Map();
  for (const [name, bytes] of members) out.set(name, bytes);

  for (const [relsName, relsBytes] of members) {
    if (!/_rels\/[^/]+\.rels$/.test(relsName)) continue;
    const partName = relsName.replace(/_rels\/([^/]+)\.rels$/, "$1");
    let relsXml = relsBytes.toString("utf8");
    const ids = [...relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"/g)].map(m => m[1]);
    const map = new Map(ids.map((id, i) => [id, `nrel${i + 1}`]));
    const rewrite = xml => xml.replace(/\brId[\w-]+/g, id => map.get(id) ?? id);
    out.set(relsName, Buffer.from(rewrite(relsXml)));
    const part = out.get(partName);
    if (part) out.set(partName, Buffer.from(rewrite(part.toString("utf8"))));
  }

  const ft = out.get("word/fontTable.xml");
  if (ft) {
    out.set("word/fontTable.xml", Buffer.from(
      ft.toString("utf8").replace(/w:fontKey="\{[0-9a-fA-F-]+\}"/g, 'w:fontKey="{00000000-0000-0000-0000-000000000000}"')
    ));
  }
  return out;
}
/* --------------------------------------------------------------------------------------- */

function unzipNormalise(docxPath, dir, entry) {
  const members = normaliseDocx(readZip(readFileSync(docxPath)));
  for (const [name, bytes] of [...members].sort((a, z) => a[0].localeCompare(z[0]))) {
    if (SKIP_MEMBERS.test(name)) continue;
    if (XML_MEMBER.test(name)) {
      const norm = normXml(bytes.toString("utf8"));
      writeFileSync(join(dir, "docx", name.replace(/[\\/]/g, "__")), norm);
      entry.docx.members[name] = sha(Buffer.from(norm));
    } else {
      const comparable = name.endsWith(".odttf") ? bytes.subarray(32) : bytes;
      entry.docx.binaries[name] = { sha: sha(comparable), bytes: bytes.length };
    }
  }
}

/* ---------------- the web server ---------------- */
function startServer(port) {
  const child = spawn("corepack", ["pnpm", "--filter", "@docforge/web", "start", "-p", String(port)], {
    cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", d => {
    const s = String(d);
    if (/error/i.test(s)) console.error("  [web] " + s.trim().slice(0, 300));
  });
  return child;
}

async function waitForServer(url, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    if (Date.now() - t0 > ms) throw new Error(`web studio did not come up at ${url} within ${ms}ms`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

function killTree(pid) {
  if (process.platform === "win32") {
    try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" }); } catch {}
    return;
  }
  try { process.kill(-pid, "SIGTERM"); } catch {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
}

/* ---------------- driving the studio ---------------- */

/** Settings the drawer will be driven to: defaults ⊕ case, with the accent the classic
    side ends on (explicit case accent, else the theme's own — theme re-inks it there). */
function targetSettings(c) {
  const t = { ...DEFAULTS, ...c.settings };
  t.accent = c.settings.accent ?? THEME_ACCENT[t.theme] ?? "#2563eb";
  return t;
}

async function applyDrawerSettings(page, target) {
  // Open the drawer through its real control (the masthead Settings button).
  await page.locator("header button", { hasText: "Settings" }).click();
  await page.waitForSelector("#sTitle", { timeout: 30000 });
  for (const summary of await page.locator('details > summary').all()) {
    if (!await summary.evaluate(el => el.parentElement.hasAttribute("open"))) await summary.click();
  }

  /* The font catalogue arrives asynchronously (loadStudio → Engine.FACES/WORD_CATALOG);
     until it lands the font selects hold only "Theme default" and driving a font value
     would silently no-op ("has no option" warning). The "custom" sentinel option is
     rendered exactly when the catalogue is — wait for it before driving font cases. */
  if (target.fontHead !== "theme" || target.fontBody !== "theme") {
    await page.waitForSelector('#sFontHead option[value="custom"]', { state: "attached", timeout: 60000 });
  }

  if (target.letterhead) {
    const [prefix, data] = target.letterhead.split(",");
    const [picker] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#sLetterhead").click(),
    ]);
    await picker.setFiles({ name: "letterhead.png", mimeType: prefix.slice(5).split(";")[0], buffer: Buffer.from(data, "base64") });
    await page.waitForSelector("#sLetterheadSize");
  }

  const warnings = await page.evaluate((t) => {
    const warn = [];
    /* React tracks input values through its own descriptor; write through the
       PROTOTYPE setter and dispatch the event React's onChange listens for
       (input for text/date/color, change for selects, click for checkboxes). */
    const nativeSet = (el, value) => {
      const proto = el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    };
    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (!el) { warn.push(`missing #${id}`); return; }
      nativeSet(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const setSelect = (id, v) => {
      const el = document.getElementById(id);
      if (!el) { warn.push(`missing #${id}`); return; }
      if (![...el.options].some(o => o.value === String(v))) { warn.push(`#${id} has no option "${v}"`); return; }
      nativeSet(el, String(v));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const setToggle = (id, v) => {
      const el = document.getElementById(id);
      if (!el) { warn.push(`missing #${id}`); return; }
      if (el.checked !== !!v) el.click();
    };

    for (const [k, id] of [["title", "sTitle"], ["subtitle", "sSubtitle"], ["author", "sAuthor"],
      ["kicker", "sKicker"], ["metaExtra", "sMetaExtra"], ["date", "sDate"],
      ["headerLeft", "sHeaderLeft"], ["headerRight", "sHeaderRight"],
      ["footerLeft", "sFooterLeft"], ["footerRight", "sFooterRight"],
      ["watermark", "sWatermark"]]) setText(id, t[k]);
    // theme FIRST — switching it re-inks the accent; the explicit accent lands last.
    setSelect("sTheme", t.theme);
    for (const [k, id] of [["page", "sPage"], ["orientation", "sOrientation"], ["margins", "sMargins"], ["citeStyle", "sCiteStyle"],
      ["borderStyle", "sBorderStyle"], ["borderWeight", "sBorderWeight"], ["borderColor", "sBorderColor"],
      ["fontHead", "sFontHead"], ["fontBody", "sFontBody"], ["baseSize", "sBaseSize"],
      ["lineSpacing", "sLineSpacing"]]) setSelect(id, t[k]);
    if (t.letterhead) setSelect("sLetterheadSize", t.letterheadSize);
    for (const [k, id] of [["cover", "tCover"], ["header", "tHeader"], ["pageNums", "tPageNums"],
      ["numbered", "tNumbered"], ["justify", "tJustify"], ["h1break", "tH1break"],
      ["hardWrap", "tHardWrap"]]) setToggle(id, t[k]);

    const well = document.querySelector('input[type="color"][aria-label="Custom accent colour"]');
    if (well) {
      nativeSet(well, t.accent);
      well.dispatchEvent(new Event("input", { bubbles: true }));
    } else warn.push("missing accent colour well");
    return warn;
  }, target);

  await page.keyboard.press("Escape"); // close the drawer (non-modal; Esc is its dismissal)
  return warnings;
}

/** Wait until the deck holds a FRESH composition (post-apply swap) and is quiet:
    no offscreen compose stage, page count + last-page height + deck identity stable
    for longer than every debounce in the app (settings 60ms, source 420ms). */
async function waitForCompose(page, timeout = 240000) {
  await page.waitForFunction(() => {
    const scroller = document.querySelector("[data-preview-scroll]");
    const deck = document.querySelector("[data-deck]");
    if (!scroller || !deck) return false;
    // the controller composes on a stage parked at left:-100000px, removed at swap
    const staging = [...scroller.children].some(
      el => el !== deck && el.style && el.style.left === "-100000px"
    );
    const pages = deck.querySelectorAll(".pagedjs_page");
    if (!pages.length) return false;
    // the pre-apply composition must be gone — a fresh swap has landed
    if (window.__wcMark && deck.contains(window.__wcMark)) return false;
    const first = deck.firstElementChild;
    const last = pages[pages.length - 1];
    const sig = pages.length + ":" + Math.round(last.getBoundingClientRect().height);
    if (first !== window.__wcFirst) { window.__wcFirst = first; window.__wcSig = null; }
    if (staging) { window.__wcSig = null; return false; }
    if (window.__wcSig === sig) return Date.now() - window.__wcSigAt > 1400;
    window.__wcSig = sig;
    window.__wcSigAt = Date.now();
    return false;
  }, null, { timeout, polling: 250 });
}

async function captureWebCase(browser, base, outDir, c) {
  const dir = join(outDir, c.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "preview"), { recursive: true });
  mkdirSync(join(dir, "pdf"), { recursive: true });
  mkdirSync(join(dir, "docx"), { recursive: true });
  const entry = {
    doc: c.doc, settings: c.settings, driven: targetSettings(c),
    preview: {}, pdf: {}, docx: { members: {}, binaries: {} }, errors: [], warnings: [], failed: null,
  };

  const ctx = await browser.newContext({ viewport: { width: 1560, height: 980 }, acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem("docforge.toured", "1"));
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).slice(0, 300)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });

  try {
    const source = readFileSync(resolve(HERE, c.doc), "utf8");
    await page.goto(base + "/studio");
    // the boot composition (welcome template) landing on the deck = studio fully up
    await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 180000 });
    await page.evaluate(() => {
      window.__wcMark = document.querySelector("[data-deck]").firstElementChild;
    });

    entry.warnings = await applyDrawerSettings(page, entry.driven);

    // the manuscript, through the real editor: select-all, replace
    await page.click(".cm-content");
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(source);

    await waitForCompose(page);
    entry.preview.pages = await page.locator("[data-deck] .pagedjs_page").count();
    // Match the classic capture's manual zoom and print-PDF contract.
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.emulateMedia({ media: "print" });
    entry.preview.files = {};
    const previewPages = page.locator("[data-deck] .pagedjs_page");
    for (let i = 0; i < Math.min(entry.preview.pages, 40); i++) {
      const name = `p${String(i + 1).padStart(2, "0")}.png`;
      const path = join(dir, "preview", name);
      await pageShot(previewPages.nth(i), path);
      entry.preview.files[name] = sha(readFileSync(path));
    }

    const pdfPath = join(dir, "pdf.pdf");
    // Match capture.mjs: the preview screenshot is taken in print media, then
    // the browser is returned to screen before print-to-PDF sets print media
    // itself. This avoids carrying screenshot-only print layout state into
    // Chromium's pagination pass (notably for letterhead/watermark pages).
    await page.emulateMedia({ media: "screen" });
    await page.emulateMedia({ media: "print" });
    /* Chromium can expose a trailing blank body page when generated margin-box
       content (letterhead is the current example) follows the final Paged.js
       page. The composed deck is the source of truth, so constrain PDF output
       to exactly the pages captured above rather than comparing an artifact
       page that the preview never produced. */
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
      pageRanges: `1-${entry.preview.pages}`,
    });
    await page.emulateMedia({ media: "screen" });
    const raster = await rasterise(pdfPath, join(dir, "pdf"), { browser, scale: 2, maxPages: 40 });
    entry.pdf.pages = raster.total;
    entry.pdf.files = {};
    for (const f of raster.files) {
      const name = f.replace(/\\/g, "/").split("/").pop();
      entry.pdf.files[name] = sha(readFileSync(f));
    }

    // Export Word — the real button, the real download
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 180000 }),
      page.locator("header button", { hasText: "Export Word" }).click(),
    ]);
    const docxPath = join(dir, "word.docx");
    await dl.saveAs(docxPath);
    unzipNormalise(docxPath, dir, entry);

    entry.errors = errors.filter(e => !/favicon/i.test(e));
  } catch (e) {
    entry.failed = String(e).slice(0, 500);
  } finally {
    await ctx.close().catch(() => {});
  }
  return entry;
}

/* ---------------- comparison ---------------- */
function firstDiffLines(aPath, bPath) {
  if (!existsSync(aPath) || !existsSync(bPath)) return "(member file missing on one side)";
  const a = readFileSync(aPath, "utf8").split("\n");
  const b = readFileSync(bPath, "utf8").split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}:\n    classic: ${(a[i] ?? "<absent>").slice(0, 220)}\n    web:     ${(b[i] ?? "<absent>").slice(0, 220)}`;
    }
  }
  return "(hash differs but lines match — encoding/EOL difference)";
}

function comparePngSet(id, kind, classic, web, classicDir, webDir, diffDir, diffs) {
  if (classic.pages !== web.pages) {
    diffs.push(`${kind} page count ${classic.pages ?? "?"} → ${web.pages ?? "?"}`);
    return;
  }
  for (const [name, hash] of Object.entries(classic.files ?? {})) {
    if (web.files?.[name] === hash) continue;
    if (!web.files?.[name]) {
      diffs.push(`${kind}/${name} missing in web capture`);
      continue;
    }
    const result = diffPng(
      join(classicDir, id, kind, name),
      join(webDir, id, kind, name),
      join(diffDir, `${id}__${kind}__${name}`),
    );
    if (result.note || result.ratio > 0.001) {
      diffs.push(`${kind}/${name} differs — ${result.note || `${(result.ratio * 100).toFixed(3)}% pixels`}`);
    }
  }
}

function compareCase(id, classic, web, classicDir, webDir, diffDir) {
  const r = {
    classicPages: classic?.preview?.pages ?? null,
    webPages: web?.preview?.pages ?? null,
    pagesMatch: null, previewMatch: null, pdfPagesMatch: null, pdfMatch: null, docxMatch: null,
    previewDiffs: [], pdfDiffs: [], memberDiffs: [], binaryDiffs: [], notes: [],
    webErrors: web?.errors ?? [], webWarnings: web?.warnings ?? [],
    failed: web?.failed || classic?.failed || null,
  };
  if (r.failed) return r;
  r.pagesMatch = r.classicPages === r.webPages;
  r.pdfPagesMatch = classic?.pdf?.pages === web?.pdf?.pages;
  mkdirSync(diffDir, { recursive: true });
  comparePngSet(id, "preview", classic.preview, web.preview, classicDir, webDir, diffDir, r.previewDiffs);
  comparePngSet(id, "pdf", classic.pdf, web.pdf, classicDir, webDir, diffDir, r.pdfDiffs);
  r.previewMatch = r.pagesMatch && r.previewDiffs.length === 0;
  r.pdfMatch = r.pdfPagesMatch && r.pdfDiffs.length === 0;

  const cm = classic.docx.members, wm = web.docx.members;
  for (const [name, hash] of Object.entries(cm)) {
    if (wm[name] === hash) continue;
    if (!wm[name]) { r.memberDiffs.push({ member: name, diff: "missing in web export" }); continue; }
    const f = name.replace(/[\\/]/g, "__");
    r.memberDiffs.push({ member: name, diff: firstDiffLines(join(classicDir, id, "docx", f), join(webDir, id, "docx", f)) });
  }
  for (const name of Object.keys(wm)) if (!cm[name]) r.memberDiffs.push({ member: name, diff: "only in web export" });

  const cb = classic.docx.binaries, wb = web.docx.binaries;
  for (const [name, info] of Object.entries(cb)) {
    const cur = wb[name];
    if (!cur) r.binaryDiffs.push(`${name}: missing in web export`);
    else if (cur.sha !== info.sha) r.binaryDiffs.push(`${name}: bytes differ (${info.bytes} → ${cur.bytes})`);
  }
  for (const name of Object.keys(wb)) if (!cb[name]) r.binaryDiffs.push(`${name}: only in web export`);

  r.docxMatch = r.memberDiffs.length === 0 && r.binaryDiffs.length === 0;
  return r;
}

/* ---------------- main ---------------- */
const distPath = resolve(ROOT, arg("dist", "dist/DocForge.html"));
if (!existsSync(distPath)) {
  console.log("dist/DocForge.html missing — building the single-file edition…");
  execSync("node build.mjs", { cwd: ROOT, stdio: "inherit" });
}

const classicDir = join(PARITY, "classic");
const webDir = join(PARITY, "web");
mkdirSync(PARITY, { recursive: true });

const browser = await launch();
let server = null;
let exitCode = 1;
try {
  // ---- side A: the single-file edition, through the existing harness ----
  if (REUSE_CLASSIC && existsSync(join(classicDir, "manifest.json"))) {
    console.log("reusing existing classic capture (--reuse-classic)");
  } else {
    console.log(`\ncapture [classic] ← ${distPath}`);
    await capture(distPath, classicDir, { only, browser, jobs: +arg("jobs", 2) });
  }
  const classicManifest = JSON.parse(readFileSync(join(classicDir, "manifest.json"), "utf8"));

  // ---- side B: the web studio, through its real UI ----
  console.log(`\nstarting web studio on :${PORT} …`);
  server = startServer(PORT);
  const base = `http://localhost:${PORT}`;
  await waitForServer(base + "/", 60000);
  console.log(`  up — driving ${cases.length} case(s)`);

  if (!REUSE_CLASSIC || !existsSync(join(webDir, "manifest.json"))) rmSync(webDir, { recursive: true, force: true });
  mkdirSync(webDir, { recursive: true });
  const webManifest = { base, cases: {} };
  for (const c of cases) {
    const t0 = Date.now();
    const entry = await captureWebCase(browser, base, webDir, c);
    webManifest.cases[c.id] = entry;
    writeFileSync(join(webDir, "manifest.json"), JSON.stringify(webManifest, null, 2));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${entry.failed ? "FAIL" : "ok  "} ${c.id}  (${entry.preview?.pages ?? "?"}p preview, ${secs}s)${entry.failed ? " — " + entry.failed : ""}`);
  }
  writeFileSync(join(webDir, "manifest.json"), JSON.stringify(webManifest, null, 2));

  // ---- compare ----
  const report = { generatedAt: new Date().toISOString(), dist: distPath, web: base, cases: {} };
  for (const c of cases) {
    report.cases[c.id] = compareCase(
      c.id, classicManifest.cases[c.id], webManifest.cases[c.id], classicDir, webDir,
      join(OUT, "web-parity-diff"),
    );
  }
  const rows = Object.entries(report.cases);
  const allOk = rows.every(([, r]) =>
    r.pagesMatch && r.previewMatch && r.pdfPagesMatch && r.pdfMatch && r.docxMatch &&
    !r.failed && r.webErrors.length === 0 && r.webWarnings.length === 0
  );
  report.summary = {
    cases: rows.length,
    pagesMatch: rows.filter(([, r]) => r.pagesMatch).length,
    previewMatch: rows.filter(([, r]) => r.previewMatch).length,
    pdfPagesMatch: rows.filter(([, r]) => r.pdfPagesMatch).length,
    pdfMatch: rows.filter(([, r]) => r.pdfMatch).length,
    docxMatch: rows.filter(([, r]) => r.docxMatch).length,
    ok: allOk,
  };
  writeFileSync(join(OUT, "web-parity-report.json"), JSON.stringify(report, null, 2));

  // ---- the table ----
  const W = [22, 14, 10, 11, 40];
  const line = cols => cols.map((c, i) => String(c).padEnd(W[i])).join(" ");
  console.log("\n" + line(["case", "classic pages", "web pages", "docx match", "notes"]));
  console.log("-".repeat(W.reduce((a, b) => a + b + 1, 0)));
  for (const [id, r] of rows) {
    const notes = r.failed ? "FAILED: " + r.failed.slice(0, 60)
      : [
          r.previewDiffs.length ? `${r.previewDiffs.length} preview diff(s)` : "",
          r.pdfDiffs.length ? `${r.pdfDiffs.length} pdf diff(s)` : "",
          r.memberDiffs.length ? `${r.memberDiffs.length} member diff(s)` : "",
          r.binaryDiffs.length ? `${r.binaryDiffs.length} binary diff(s)` : "",
          r.webErrors.length ? `${r.webErrors.length} console error(s)` : "",
          r.webWarnings.length ? `${r.webWarnings.length} drive warning(s)` : "",
        ].filter(Boolean).join(", ") || "—";
    console.log(line([id, r.classicPages ?? "?", r.webPages ?? "?", r.docxMatch === null ? "?" : r.docxMatch ? "YES" : "NO", notes]));
  }
  for (const [id, r] of rows) {
    for (const d of r.memberDiffs.slice(0, 3)) console.log(`\n  ✗ ${id} · ${d.member}\n    ${d.diff.replace(/\n/g, "\n  ")}`);
    for (const b of r.binaryDiffs.slice(0, 3)) console.log(`\n  ✗ ${id} · ${b}`);
  }
  console.log(`\nweb parity: ${report.summary.previewMatch}/${rows.length} preview, ${report.summary.pdfMatch}/${rows.length} pdf, ${report.summary.docxMatch}/${rows.length} docx match`);
  console.log(`report: ${join(OUT, "web-parity-report.json")}`);
  exitCode = allOk ? 0 : 1;
} finally {
  if (server?.pid) killTree(server.pid);
  await browser.close().catch(() => {});
}
process.exit(exitCode);
