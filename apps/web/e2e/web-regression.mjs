/* Focused production-browser regression suite for apps/web.

   This intentionally uses the repository's existing playwright-core harness
   rather than adding a second runner. Each case gets a fresh context; the
   cases that verify persistence do their reload inside that same context so
   IndexedDB is exercised without leaking state between cases.

   Usage:
     corepack pnpm --filter @docforge/web build
     PW_CHROMIUM=/usr/bin/google-chrome node apps/web/e2e/web-regression.mjs

   WEB_E2E_BASE_URL may point at an already-running production server. */
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { launch } from "../../../qa/_browser.mjs";
import { auditWeb } from "../../../qa/web-audit.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, "../../..");
const PORT = Number(process.env.WEB_E2E_PORT || 3212);
const BASE = process.env.WEB_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SOURCE = [
  "# Regression manuscript",
  "",
  "A needle appears here.",
  "",
  "A second needle appears here.",
  "",
  "A third needle appears here.",
  "",
  ...Array.from(
    { length: 18 },
    (_, i) =>
      `## Section ${i + 1}\n\nA long paragraph keeps the preview deck scrollable. This is deterministic content for the web regression suite.`,
  ),
].join("\n");

const failures = [];
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function startServer() {
  const child = spawn(
    "corepack",
    ["pnpm", "--filter", "@docforge/web", "start", "-p", String(PORT)],
    {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stderr.on("data", (data) => {
    if (/error/i.test(String(data))) process.stderr.write(`[web] ${String(data).slice(0, 300)}`);
  });
  return child;
}

async function waitForServer(url, timeout = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await sleep(500);
  }
  throw new Error(`production web server did not start at ${url}`);
}

function stopServer(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {}
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {}
  }
}

async function session(browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  // Only the one-time UI tour is acknowledged. Documents/IndexedDB/caches
  // remain empty in every new browser profile.
  await context.addInitScript(() => localStorage.setItem("docforge.toured", "1"));
  const page = await context.newPage();
  const telemetry = { errors: [], unexpectedRequests: [] };
  page.on("pageerror", (error) =>
    telemetry.errors.push(`pageerror: ${String(error).slice(0, 300)}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) {
      telemetry.errors.push(`console: ${message.text().slice(0, 300)}`);
    }
  });
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(BASE) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      telemetry.unexpectedRequests.push(url);
    }
  });
  page.setDefaultTimeout(30000);
  return { context, page, telemetry };
}

async function openStudio(page) {
  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 120000 });
  await page.waitForSelector(".cm-content[contenteditable='true']", {
    state: "attached",
    timeout: 30000,
  });
}

async function replaceSource(page, source, needle = source.split("\n", 1)[0]) {
  await page.evaluate(() => { window.__oldDeck = document.querySelector("[data-deck]")?.firstElementChild; });
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(source);
  await page.waitForFunction(
    (needle) => document.querySelector(".cm-content")?.textContent?.includes(needle),
    needle,
  );
  await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 120000 });
  await page.waitForFunction(() => {
    const deck = document.querySelector("[data-deck]");
    return deck?.firstElementChild && deck.firstElementChild !== window.__oldDeck;
  }, null, { timeout: 60000 });
  await sleep(500);
}

async function assertClean(telemetry) {
  check(telemetry.errors.length === 0, `console/page errors: ${telemetry.errors.join(" | ")}`);
  check(
    telemetry.unexpectedRequests.length === 0,
    `unexpected network requests: ${telemetry.unexpectedRequests.join(" | ")}`,
  );
}

async function runAxe(page, label) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const result = await page.evaluate(async () => {
    const scope = document.querySelector("[data-shell]") || document.body;
    return window.axe.run(
      { include: [scope], exclude: ["[data-deck]"] },
      { runOnly: ["wcag2a", "wcag2aa"] },
    );
  });
  check(
    result.violations.length === 0,
    `${label} axe violations: ${result.violations.map((v) => `${v.id}(${v.nodes.map((n) => n.target.join(" ")).join(";")})`).join(", ")}`,
  );
}

async function makePdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([595, 842]);
  page.drawText("DocForge web regression PDF", { x: 48, y: 780, size: 18, font });
  return Buffer.from(await document.save());
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${String(error).slice(0, 500)}`);
    console.log(`FAIL ${name} — ${String(error).slice(0, 500)}`);
  }
}

async function main() {
  let server = null;
  let browser = null;
  try {
    if (!process.env.WEB_E2E_BASE_URL) {
      server = startServer();
      await waitForServer(`${BASE}/`);
    }
    browser = await launch();

    await run(
      "studio boot, source editing, live editing, caret and scroll restoration",
      async () => {
        const { context, page, telemetry } = await session(browser);
        try {
          await openStudio(page);
          await replaceSource(page, SOURCE);
          check(
            await page
              .locator(".cm-content")
              .textContent()
              .then((text) => text.includes("Regression manuscript")),
            "source was not edited",
          );

          const scroll = page.locator("[data-preview-scroll]");
          await scroll.evaluate((el) => {
            el.scrollTop = Math.min(900, el.scrollHeight / 2);
          });
          const editables = page.locator("[data-deck] .content > p[data-ss]");
          const visibleSourceLine = await editables.evaluateAll((els) => {
            const visible = els.find((el) => {
              const rect = el.getBoundingClientRect();
              return rect.top >= 0 && rect.top < window.innerHeight;
            });
            return visible?.getAttribute("data-ss") ?? els[0]?.getAttribute("data-ss") ?? "0";
          });
          const editable = page.locator(
            `[data-deck] .content > p[data-ss="${visibleSourceLine}"]`,
          ).first();
          await editable.click();
          const before = await scroll.evaluate((el) => el.scrollTop);
          await page.keyboard.press("End");
          await page.keyboard.insertText(" live-edited");
          await page.waitForFunction(
            () => document.querySelector(".cm-content")?.textContent?.includes("live-edited"),
            null,
            { timeout: 60000 },
          );
          await sleep(1600);
          const after = await scroll.evaluate((el) => el.scrollTop);
          check(Math.abs(after - before) < 80, `preview scroll moved from ${before} to ${after}`);
          check(
            await page.evaluate(
              () => document.activeElement?.getAttribute("contenteditable") === "true",
            ),
            "live-edit caret was not restored",
          );
          await assertClean(telemetry);
        } finally {
          await context.close();
        }
      },
    );

    await run("undo and redo share the source/live-edit history", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await replaceSource(page, "# History\n\nbase text");
        const editor = page.locator(".cm-content");
        await editor.click();
        await page.keyboard.press("Control+End");
        await page.keyboard.insertText(" history marker");
        check(
          (await editor.textContent()).includes("history marker"),
          "history marker was not inserted",
        );
        await page.keyboard.press("Control+z");
        await page.waitForFunction(
          () => !document.querySelector(".cm-content")?.textContent?.includes("history marker"),
        );
        await page.keyboard.press("Control+y");
        await page.waitForFunction(() =>
          document.querySelector(".cm-content")?.textContent?.includes("history marker"),
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("templates are confirmable and undoable", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await page.getByRole("button", { name: "Templates" }).click();
        await page.getByRole("menuitem").first().click();
        await page.getByRole("button", { name: "Open template" }).click();
        await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 120000 });
        check(
          (await page.locator(".cm-content").textContent()).length > 20,
          "template did not populate the manuscript",
        );
        const undo = page.getByRole("button", { name: /Undo/i });
        if (await undo.count()) await undo.click();
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("IndexedDB restore and version history survive reload", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await replaceSource(page, "# Persisted regression doc\n\nIndexedDB restore marker");
        await page.keyboard.press("Control+s");
        await page.getByText("Saved on this device").waitFor({ timeout: 30000 });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(
          () =>
            document
              .querySelector(".cm-content")
              ?.textContent?.includes("IndexedDB restore marker"),
          null,
          { timeout: 60000 },
        );

        await page.locator('header button[title^="Version history"]').click();
        await page.getByRole("dialog").getByRole("button", { name: "Save a checkpoint" }).click();
        await page
          .getByRole("dialog")
          .getByText("checkpoint", { exact: true })
          .waitFor({ timeout: 30000 });
        check(
          (await page.getByRole("list", { name: "Saved states, newest first" }).count()) === 1,
          "version history did not list the checkpoint",
        );
        await page.getByRole("button", { name: "Close" }).last().click();
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("DOCX export and Markdown import use the real browser ports", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await replaceSource(page, "# Export regression\n\nA deterministic Word export.");
        const download = page.waitForEvent("download", { timeout: 60000 });
        await page.getByRole("button", { name: "Export Word" }).click();
        const path = await (await download).path();
        check(!!path, "DOCX download had no file path");
        const bytes = readFileSync(path);
        check(bytes[0] === 0x50 && bytes[1] === 0x4b, "DOCX export was not an OOXML zip");

        const input = page.locator('input[type="file"][accept*=".md"]');
        await input.setInputFiles({
          name: "import-regression.md",
          mimeType: "text/markdown",
          buffer: Buffer.from("# Imported web document\n\nImported marker."),
        });
        await page.waitForFunction(
          () =>
            document.querySelector(".cm-content")?.textContent?.includes("Imported web document"),
          null,
          { timeout: 60000 },
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("PDF bench route opens and paints a PDF", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await page.goto(`${BASE}/pdf`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Open PDF…" }).first().click();
        await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
          name: "bench-regression.pdf",
          mimeType: "application/pdf",
          buffer: await makePdf(),
        });
        await page.waitForSelector("#peScroll", { timeout: 60000 });
        await page.waitForFunction(
          () => document.querySelectorAll("#peDeck canvas").length > 0,
          null,
          { timeout: 60000 },
        );
        check(
          (await page.getByRole("button", { name: "Export PDF" }).count()) === 1,
          "PDF bench did not enter the open phase",
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("command palette and find/replace are keyboard reachable", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await replaceSource(page, "# Search\n\nneedle one\n\nneedle two\n\nneedle three");
        await page.locator("header[data-chrome]").click({ position: { x: 8, y: 8 } });
        await page.keyboard.press("Control+k");
        const commandInput = page.getByRole("combobox", { name: "Search commands" });
        await commandInput.fill("open settings");
        await commandInput.press("Enter");
        await page.getByRole("dialog").getByText("Settings", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Close settings" }).click();

        await page.keyboard.press("Control+f");
        await page
          .getByRole("search", { name: "Find and replace" })
          .getByRole("textbox", { name: "Find" })
          .fill("needle");
        await page.getByText("3 matches", { exact: true }).waitFor({ timeout: 30000 });
        await page
          .getByRole("search", { name: "Find and replace" })
          .getByRole("textbox", { name: "Replace with" })
          .fill("replaced");
        await page.getByRole("button", { name: "All", exact: true }).click();
        await page.waitForFunction(() =>
          document.querySelector(".cm-content")?.textContent?.includes("replaced three"),
        );
        await page.keyboard.press("Escape");
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("keyboard-only navigation and mobile pane switching", async () => {
      const { context, page, telemetry } = await session(browser, { width: 700, height: 900 });
      try {
        await openStudio(page);
        await page.keyboard.press("Tab");
        check(
          await page.evaluate(() => document.activeElement?.tagName !== "BODY"),
          "Tab did not move focus",
        );
        check((await page.locator('[role="toolbar"]').count()) > 0, "toolbar role is missing");
        await page.getByRole("button", { name: "Source", exact: true }).last().click();
        check(
          await page.evaluate(() => document.body.dataset.mobilePane === "source"),
          "source pane did not activate on mobile",
        );
        await page.getByRole("button", { name: "Preview", exact: true }).last().click();
        check(
          await page.evaluate(() => document.body.dataset.mobilePane === "preview"),
          "preview pane did not activate on mobile",
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("hosted content security rejects executable Markdown HTML", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await replaceSource(
          page,
          '<script>window.__pwned = true</script>\n\n<img src="https://tracker.invalid/pixel" onerror="window.__pwned=true">\n\n[bad](javascript:alert(1))\n\nSafe text',
          "Safe text",
        );
        await sleep(1600);
        const unsafe = await page.locator("[data-deck]").evaluate((deck) => ({
          scripts: deck.querySelectorAll("script").length,
          handlers: [...deck.querySelectorAll("*")].filter((el) =>
            [...el.attributes].some((attr) => attr.name.toLowerCase().startsWith("on")),
          ).length,
          javascript: deck.innerHTML.toLowerCase().includes("javascript:"),
          pwned: Boolean(window.__pwned),
        }));
        check(
          unsafe.scripts === 0 && unsafe.handlers === 0 && !unsafe.javascript && !unsafe.pwned,
          "unsafe Markdown HTML reached the hosted preview",
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("axe accessibility checks cover landing, studio, and settings", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("main");
        await runAxe(page, "landing");
        await openStudio(page);
        await runAxe(page, "studio");
        await page.getByRole("button", { name: "Settings" }).click();
        await page.getByRole("dialog").waitFor();
        await runAxe(page, "settings");
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });

    await run("offline reload composes after the first production visit", async () => {
      const { context, page, telemetry } = await session(browser);
      try {
        await openStudio(page);
        await page.evaluate(async () => {
          if (navigator.serviceWorker) await navigator.serviceWorker.ready;
        });
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 120000 });
        await context.setOffline(true);
        await page.reload({ waitUntil: "commit", timeout: 60000 });
        await page.waitForSelector("[data-deck] .pagedjs_page", { timeout: 120000 });
        check(
          (await page.locator("[data-deck] .pagedjs_page").count()) > 0,
          "offline reload did not compose",
        );
        await assertClean(telemetry);
      } finally {
        await context.close();
      }
    });
    await run("Lighthouse production-route regression floors", () => auditWeb(BASE));
  } finally {
    if (browser) await browser.close().catch(() => {});
    stopServer(server);
  }
  if (failures.length) {
    console.log(`\n${failures.length} web regression failure(s)`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nWEB REGRESSION PASSES");
  }
}

await main();
