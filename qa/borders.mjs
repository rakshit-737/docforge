/* Border-system checks: line counts, header clearance, weight progression, and the
   phantom-page regression. Asserts on rasterised pixels, not on CSS. */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { PNG } from "./_png.mjs";
import { launch } from "./_browser.mjs";
import { rasterise } from "./_raster.mjs";
import * as drive from "./_drive.mjs";

const b = await launch();
const p = await drive.open(b);
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? `  (${extra})` : ""));
  cond ? pass++ : fail++;
};

const SRC = `# One

Prose on the first body page.

[pagebreak]

# Two

Prose on the second body page.
`;

/* Count distinct dark vertical line runs across a horizontal scan band on the left edge. */
function lineRuns(png, yFrom, yTo, xMax = 80) {
  const counts = [];
  for (let y = yFrom; y < yTo; y += 3) {
    let runs = 0, inRun = false;
    for (let x = 0; x < xMax; x++) {
      const i = (y * png.width + x) * 4;
      const dark = png.data[i] < 160 && png.data[i + 3] > 100;
      if (dark && !inRun) { runs++; inRun = true; }
      if (!dark) inRun = false;
    }
    counts.push(runs);
  }
  counts.sort((a, b) => a - b);
  return counts[Math.floor(counts.length / 2)]; // median
}

async function capture(style, weight = "medium", color = "ink") {
  await drive.applyDoc(p, {
    source: SRC,
    settings: { title: "Border QA", cover: true, header: true, pageNums: true, borderStyle: style, borderWeight: weight, borderColor: color },
  });
  const id = `${style}-${weight}-${color}`;
  await drive.printPdf(p, `qa/out/b2/${id}.pdf`);
  const r = await rasterise(`qa/out/b2/${id}.pdf`, `qa/out/b2/${id}`, { browser: b, scale: 3, maxPages: 2 });
  return { id, png: PNG.read(readFileSync(r.files[1])) }; // body page
}

/* line-count expectations per style (median over mid-page band) */
for (const [style, want] of [["rule", 1], ["double", 2], ["triple", 3], ["thickthin", 2], ["thinthick", 2]]) {
  const { png } = await capture(style);
  const runs = lineRuns(png, Math.floor(png.height * 0.4), Math.floor(png.height * 0.6));
  ok(`${style} draws ${want} line(s)`, runs === want, `saw ${runs}`);
}

/* dashed / dotted: interrupted coverage down the page */
for (const style of ["dashed", "dotted"]) {
  const { png } = await capture(style);
  let dark = 0, total = 0;
  const x = (() => { // find the border column — scan several rows, a dash gap can hide one
    for (let y = Math.floor(png.height * 0.4); y < Math.floor(png.height * 0.6); y += 7) {
      for (let x = 0; x < 80; x++) {
        const i = (y * png.width + x) * 4;
        if (png.data[i] < 160) return x;
      }
    }
    return -1;
  })();
  ok(`${style} border exists`, x >= 0);
  if (x >= 0) {
    for (let y = Math.floor(png.height * 0.3); y < Math.floor(png.height * 0.7); y++) {
      const i = (y * png.width + x) * 4;
      total++; if (png.data[i] < 160) dark++;
    }
    const cov = dark / total;
    ok(`${style} is interrupted`, cov > 0.2 && cov < 0.9, `coverage ${cov.toFixed(2)}`);
  }
}

/* weight progression: measure ink thickness of the rule at each weight */
const widths = {};
for (const w of ["fine", "medium", "bold"]) {
  const { png } = await capture("rule", w);
  const y = Math.floor(png.height / 2);
  let first = -1, last = -1;
  for (let x = 0; x < 80; x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i] < 160) { if (first < 0) first = x; last = x; }
  }
  widths[w] = last - first + 1;
}
ok("fine < medium < bold", widths.fine < widths.medium && widths.medium < widths.bold,
  `fine=${widths.fine}px medium=${widths.medium}px bold=${widths.bold}px`);

/* header clearance: no dark border pixels across the header text row for compound styles */
for (const style of ["thickthin", "thinthick", "triple"]) {
  const { png } = await capture(style, "bold");
  // header glyphs sit ~7-9mm from the top at scale 3 (~83-106px); border must stop above them.
  // Find the lowest border row within the top 12mm, then find the highest text row.
  const mmPx = png.height / 297 ; // A4
  let borderBottom = 0;
  for (let y = 0; y < Math.floor(12 * mmPx * 3 / 3); y++) {
    let run = 0;
    for (let x = Math.floor(png.width * 0.35); x < Math.floor(png.width * 0.65); x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] < 160) run++;
    }
    if (run > png.width * 0.25) borderBottom = y; // a horizontal border line spans widely
  }
  // header text row: dark pixels in the left third, sparse (glyphs, not a line)
  let textTop = -1;
  for (let y = borderBottom + 1; y < Math.floor(png.height * 0.12); y++) {
    let n = 0;
    for (let x = Math.floor(png.width * 0.08); x < Math.floor(png.width * 0.3); x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] < 170) n++;
    }
    if (n > 4) { textTop = y; break; }
  }
  ok(`${style}(bold) clears the running header`, textTop === -1 || textTop > borderBottom + 2,
    `borderBottom=${borderBottom} textTop=${textTop}`);
}

/* cover exemption */
{
  await drive.applyDoc(p, { source: SRC, settings: { title: "Border QA", cover: true, borderStyle: "rule" } });
  await drive.printPdf(p, "qa/out/b2/cover.pdf");
  const r = await rasterise("qa/out/b2/cover.pdf", "qa/out/b2/cover", { browser: b, scale: 2, maxPages: 1 });
  const png = PNG.read(readFileSync(r.files[0]));
  const runs = lineRuns(png, Math.floor(png.height * 0.4), Math.floor(png.height * 0.6), 40);
  ok("cover page has no border", runs === 0, `saw ${runs}`);
}

/* phantom page: docx export then print must not add a blank trailing page */
{
  await drive.applyDoc(p, {
    source: "[toc]\n\n# A\n\nText.\n\n# B\n\nText.\n",
    settings: { title: "Phantom", cover: true, borderStyle: "rule" },
  });
  const before = await p.locator(".pagedjs_page").count();
  await drive.exportDocx(p, "qa/out/b2/phantom.docx");
  await drive.printPdf(p, "qa/out/b2/phantom.pdf");
  const r = await rasterise("qa/out/b2/phantom.pdf", "qa/out/b2/phantom", { browser: b, scale: 1, maxPages: 20 });
  ok("no phantom page after docx export", r.total === before, `screen=${before} print=${r.total}`);
}

/* Word round-trip: triple through real Word still opens and draws three-line style */
{
  await drive.applyDoc(p, { source: SRC, settings: { title: "Border QA", cover: true, borderStyle: "triple" } });
  await drive.exportDocx(p, "qa/out/b2/triple.docx");
  const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("qa/_docx2pdf.ps1"),
    "-In", "qa/out/b2/triple.docx", "-Out", resolve("qa/out/b2/triple-word.pdf")], { encoding: "utf8", timeout: 240000 });
  ok("triple.docx converts through Word", /PAGES=\d/.test(out));
}

const errors = p.__errors.filter(e => !/favicon/i.test(e));
ok("no console errors", errors.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exitCode = fail ? 1 : 0;
