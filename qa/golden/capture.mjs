/* Capture one built DocForge.html against the golden case matrix.

   Per case:
     preview/pNN.png   screenshot of every rendered .pagedjs_page
     pdf/pNN.png       the printed PDF (Chromium print-to-PDF, the same engine the
                       in-app print dialog uses) rasterised per page
     pdf.pdf           kept for eyeballing (its bytes carry a CreationDate — never compared)
     docx/…            exported .docx: XML members normalised and written out; binary
                       members (embedded fonts, media) hashed into the manifest only
     manifest entry    SHA-256 of every comparable artifact + console errors

   docProps/ is skipped entirely — it holds creation timestamps.
   Cases run `jobs` at a time, each in its own browser context. */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { launch } from "../_browser.mjs";
import { rasterise } from "../_raster.mjs";
import { applyDoc, printPdf, exportDocx } from "../_drive.mjs";
import { readZip } from "./_zip.mjs";
import { CASES } from "./matrix.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_PAGES = 40;

const sha = buf => createHash("sha256").update(buf).digest("hex");
const normXml = xml => xml.replace(/></g, ">\n<");

const SKIP_MEMBERS = /^docProps\//;
const XML_MEMBER = /\.(xml|rels)$/;

/* The docx lib generates fresh random relationship ids (hyperlinks) and a fresh font-
   obfuscation GUID on every export, so identical documents differ byte-wise run to run.
   Normalise: rewrite each part's relationship ids to their ordinal position in its own
   .rels file (applied to the .rels and the part together, so references stay paired),
   zero the w:fontKey GUIDs, and hash .odttf font binaries from byte 32 — obfuscation
   only XORs the first 32 bytes with the (random) key. */
function normaliseDocx(members) {
  const out = new Map();
  for (const [name, bytes] of members) out.set(name, bytes);

  for (const [relsName, relsBytes] of members) {
    if (!/_rels\/[^/]+\.rels$/.test(relsName)) continue;
    const partName = relsName.replace(/_rels\/([^/]+)\.rels$/, "$1");
    let relsXml = relsBytes.toString("utf8");
    const ids = [...relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"/g)].map(m => m[1]);
    const map = new Map(ids.map((id, i) => [id, `nrel${i + 1}`]));
    // docx-lib ids use the nanoid alphabet — letters, digits, "-" and "_" — match all of it
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

async function openApp(browser, distUrl) {
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 980 }, acceptDownloads: true });
  const page = await ctx.newPage();
  // Under full parallel load the machine starves rAF/goto; generous timeouts, not flakes.
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);
  const errors = [];
  page.on("pageerror", e => errors.push("PAGEERROR: " + String(e).slice(0, 300)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  page.__errors = errors;
  await page.goto(distUrl);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("docforge.helped", "1"); });
  await page.reload();
  await page.waitForSelector(".pagedjs_page", { timeout: 90000 });
  return page;
}

async function captureOnce(b, distUrl, outDir, c, scale) {
  const dir = join(outDir, c.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "preview"), { recursive: true });
  mkdirSync(join(dir, "docx"), { recursive: true });

  const entry = { doc: c.doc, settings: c.settings, preview: {}, pdf: {}, docx: { members: {}, binaries: {} }, errors: [], failed: null };
  let page;
  try {
    const source = readFileSync(resolve(HERE, c.doc), "utf8");
    page = await openApp(b, distUrl);
    const unexpressed = await applyDoc(page, { source, settings: c.settings });
    /* The baseline edition predates settings the current one has, so this is
       expected there and recorded rather than hidden; on the HEAD side it
       means a case is claiming to exercise something the drawer cannot say. */
    if (unexpressed.length) entry.unexpressed = unexpressed;

    // Pin the preview to MANUAL zoom (out then in lands back on 1.0 in "man" mode).
    // In fit mode every resize/observer re-runs applyZoom, and the screenshot loop's
    // auto-scroll can spawn a scrollbar → re-fit → later pages captured smaller.
    await page.click("#zoomOut");
    await page.click("#zoomIn");
    // Then wait for true layout quiescence: page count + last-page height stable for 600ms.
    await page.waitForFunction(() => {
      const pages = document.querySelectorAll(".pagedjs_page");
      const last = pages[pages.length - 1];
      const sig = pages.length + ":" + (last ? Math.round(last.getBoundingClientRect().height) : 0);
      if (window.__goldenSig === sig) return Date.now() - window.__goldenSigAt > 600;
      window.__goldenSig = sig;
      window.__goldenSigAt = Date.now();
      return false;
    }, null, { timeout: 90000, polling: 250 });

    // (a) rendered preview pages
    const pages = page.locator(".pagedjs_page");
    const n = Math.min(await pages.count(), MAX_PAGES);
    entry.preview.pages = await pages.count();
    entry.preview.files = {};
    for (let i = 0; i < n; i++) {
      const name = `p${String(i + 1).padStart(2, "0")}.png`;
      const p = join(dir, "preview", name);
      await pages.nth(i).screenshot({ path: p, animations: "disabled" });
      entry.preview.files[name] = sha(readFileSync(p));
    }

    // (b) printed PDF, rasterised
    const pdfPath = join(dir, "pdf.pdf");
    await printPdf(page, pdfPath);
    const r = await rasterise(pdfPath, join(dir, "pdf"), { browser: b, scale, maxPages: MAX_PAGES });
    entry.pdf.pages = r.total;
    entry.pdf.files = {};
    for (const f of r.files) {
      const name = f.replace(/\\/g, "/").split("/").pop();
      entry.pdf.files[name] = sha(readFileSync(f));
    }

    // (c) exported .docx, unzipped and normalised
    const docxPath = join(dir, "word.docx");
    await exportDocx(page, docxPath);
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

    entry.errors = page.__errors.filter(e => !/favicon/i.test(e));
  } finally {
    if (page) await page.context().close().catch(() => {});
  }
  return entry;
}

async function runCase(b, distUrl, outDir, c, scale) {
  const t0 = Date.now();
  let entry;
  for (let attempt = 1; ; attempt++) {
    try {
      entry = await captureOnce(b, distUrl, outDir, c, scale);
      break;
    } catch (e) {
      if (attempt < 2) { console.log(`  retry ${c.id} — ${String(e).split("\n")[0].slice(0, 160)}`); continue; }
      entry = { doc: c.doc, settings: c.settings, preview: {}, pdf: {}, docx: { members: {}, binaries: {} }, errors: [], failed: String(e).slice(0, 500) };
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${entry.failed ? "FAIL" : "ok  "} ${c.id}  (${entry.preview?.pages ?? "?"}p preview, ${entry.pdf?.pages ?? "?"}p pdf, ${secs}s)${entry.failed ? " — " + entry.failed : ""}`);
  return entry;
}

/** Capture `distPath` into `outDir`. `only` filters case ids. Returns the manifest. */
export async function capture(distPath, outDir, { only = null, scale = 2, browser = null, jobs = 0 } = {}) {
  const distUrl = "file:///" + resolve(distPath).replace(/\\/g, "/");
  const appSha = sha(readFileSync(distPath));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const own = !browser;
  const b = browser || (await launch());
  const manifest = { app: appSha, scale, cases: {} };
  const queue = CASES.filter(c => !only || only.includes(c.id));
  const J = jobs || Math.max(1, Math.min(3, os.cpus().length - 2));
  console.log(`  ${queue.length} case(s), ${J} at a time`);

  try {
    let idx = 0;
    const worker = async () => {
      for (;;) {
        const i = idx++;
        if (i >= queue.length) return;
        manifest.cases[queue[i].id] = await runCase(b, distUrl, outDir, queue[i], scale);
      }
    };
    await Promise.all(Array.from({ length: Math.min(J, queue.length) }, worker));
  } finally {
    if (own) await b.close();
  }

  // manifest key order must not depend on completion order
  manifest.cases = Object.fromEntries(Object.entries(manifest.cases).sort(([a], [z]) => a.localeCompare(z)));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
