/* Compare two golden captures. Exact SHA match short-circuits; differing PNGs get a
   pixel diff (pass under the threshold — anti-aliasing jitter — fail above it, with a
   magenta diff mask written for review); differing XML fails with the first divergent
   lines quoted. Prints a report and returns { ok, failures }. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "../_png.mjs";
import { writePng } from "./_pngwrite.mjs";

const PIXEL_TOLERANCE = 16;    // per-channel delta below this is "same pixel"
const DIFF_RATIO_MAX = 0.001;  // ≤0.1% differing pixels per page passes (§9.1)

function diffPng(aPath, bPath, maskPath) {
  const a = PNG.read(readFileSync(aPath));
  const b = PNG.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, note: `size ${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  let bad = 0;
  const mask = Buffer.alloc(a.data.length);
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2])
    );
    if (d > PIXEL_TOLERANCE) {
      bad++;
      mask[i] = 255; mask[i + 2] = 255; mask[i + 3] = 255; // magenta
    } else {
      const g = (a.data[i] * 0.3 + a.data[i + 1] * 0.6 + a.data[i + 2] * 0.1) | 0;
      mask[i] = mask[i + 1] = mask[i + 2] = 128 + (g >> 1); mask[i + 3] = 255;
    }
  }
  const ratio = bad / (a.width * a.height);
  if (ratio > DIFF_RATIO_MAX && maskPath) {
    writeFileSync(maskPath, writePng({ width: a.width, height: a.height, data: mask }));
  }
  return { ratio };
}

function firstXmlDiff(aPath, bPath) {
  const a = readFileSync(aPath, "utf8").split("\n");
  const b = readFileSync(bPath, "utf8").split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}:\n  baseline: ${(a[i] ?? "<absent>").slice(0, 200)}\n  current:  ${(b[i] ?? "<absent>").slice(0, 200)}`;
    }
  }
  return "(hash differs but lines match — encoding/EOL difference)";
}

/** dirA = baseline, dirB = current.
    `exempt` names cases that exercise a construct the baseline edition does not have —
    they are captured on both sides but not compared, because the baseline renders the
    markup as literal text and the difference is the feature, not a regression. The
    dev-facing `--compare before after` passes no exemptions, so those cases are still
    fully covered between two builds of the current tree. */
export function compare(dirA, dirB, { reportDir = null, exempt = [] } = {}) {
  const skip = new Set(exempt);
  const mA = JSON.parse(readFileSync(join(dirA, "manifest.json"), "utf8"));
  const mB = JSON.parse(readFileSync(join(dirB, "manifest.json"), "utf8"));
  const failures = [];
  const notes = [];
  const fail = (c, what) => failures.push(`${c}: ${what}`);
  if (reportDir) mkdirSync(reportDir, { recursive: true });

  const ids = new Set([...Object.keys(mA.cases), ...Object.keys(mB.cases)]);
  for (const id of ids) {
    const a = mA.cases[id], b = mB.cases[id];
    if (skip.has(id)) {
      // Exempt from comparison, never from rendering: the current side must still
      // capture cleanly, or the new construct is broken and nothing would say so.
      if (!b) fail(id, "exempt case missing from the current capture");
      else if (b.failed) fail(id, `exempt case failed to capture: ${b.failed}`);
      else if (b.errors.length) fail(id, `console errors in current: ${b.errors.slice(0, 3).join(" | ")}`);
      else notes.push(`${id}: exempt — post-baseline construct, not compared`);
      continue;
    }
    if (!a || !b) { fail(id, `present only in ${a ? "baseline" : "current"}`); continue; }
    if (a.failed || b.failed) { fail(id, `capture failed — baseline: ${a.failed || "ok"}; current: ${b.failed || "ok"}`); continue; }
    if (b.errors.length) fail(id, `console errors in current: ${b.errors.slice(0, 3).join(" | ")}`);

    for (const [kind, sub] of [["preview", "preview"], ["pdf", "pdf"]]) {
      if (a[kind].pages !== b[kind].pages) { fail(id, `${kind} page count ${a[kind].pages} → ${b[kind].pages}`); continue; }
      for (const [name, hash] of Object.entries(a[kind].files)) {
        if (b[kind].files[name] === hash) continue;
        if (!b[kind].files[name]) { fail(id, `${kind}/${name} missing in current`); continue; }
        const mask = reportDir ? join(reportDir, `${id}__${kind}__${name}`) : null;
        const { ratio, note } = diffPng(join(dirA, id, sub, name), join(dirB, id, sub, name), mask);
        if (note || ratio > DIFF_RATIO_MAX) {
          fail(id, `${kind}/${name} differs — ${note || (ratio * 100).toFixed(3) + "% pixels"}${mask ? ` (mask: ${mask})` : ""}`);
        } else {
          notes.push(`${id}: ${kind}/${name} within tolerance (${(ratio * 100).toFixed(4)}%)`);
        }
      }
    }

    for (const [name, hash] of Object.entries(a.docx.members)) {
      if (b.docx.members[name] === hash) continue;
      if (!b.docx.members[name]) { fail(id, `docx ${name} missing in current`); continue; }
      const f = name.replace(/[\\/]/g, "__");
      fail(id, `docx ${name} differs — ${firstXmlDiff(join(dirA, id, "docx", f), join(dirB, id, "docx", f))}`);
    }
    for (const name of Object.keys(b.docx.members)) {
      if (!a.docx.members[name]) fail(id, `docx ${name} new in current`);
    }
    for (const [name, info] of Object.entries(a.docx.binaries)) {
      const cur = b.docx.binaries[name];
      if (!cur) fail(id, `docx binary ${name} missing in current`);
      else if (cur.sha !== info.sha) fail(id, `docx binary ${name} differs (${info.bytes} → ${cur.bytes} bytes)`);
    }
  }

  const ok = failures.length === 0;
  const report = { ok, cases: ids.size, failures, withinTolerance: notes };
  if (reportDir) writeFileSync(join(reportDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\ngolden compare: ${ids.size} cases, ${failures.length} failure(s), ${notes.length} within-tolerance note(s)`);
  for (const f of failures) console.log("  ✗ " + f);
  for (const n of notes.slice(0, 10)) console.log("  ~ " + n);
  return report;
}
