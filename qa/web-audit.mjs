/* Pinned, development-only Lighthouse; no payload is sent off-device. Invoked
   by the production E2E job against its local server. Baselines here are
   regression floors, not a claim that the master plan's >=95 target is met. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import lighthouse from "lighthouse";
import { launch } from "./_browser.mjs";

const FLOORS = {
  "/": { performance: 0.9, accessibility: 0.95, "best-practices": 0.9, seo: 0.9 },
  "/studio": { performance: 0.75, accessibility: 0.9, "best-practices": 0.9, seo: 0.9 },
};

export async function auditWeb(base) {
  const port = Number(process.env.LIGHTHOUSE_PORT || 9225);
  const browser = await launch({ args: ["--no-sandbox", `--remote-debugging-port=${port}`] });
  const out = resolve("qa/out/lighthouse");
  mkdirSync(out, { recursive: true });
  const failures = [];
  try {
    for (const [route, floors] of Object.entries(FLOORS)) {
      const result = await lighthouse(`${base}${route}`, {
        port,
        output: ["json", "html"],
        logLevel: "error",
        onlyCategories: Object.keys(floors),
        formFactor: "desktop",
        screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
      });
      const label = route === "/" ? "landing" : "studio";
      if (!result || result.lhr.runtimeError) throw new Error(`Lighthouse ${label} failed: ${result?.lhr.runtimeError?.message}`);
      writeFileSync(resolve(out, `${label}.json`), result.report[0]);
      writeFileSync(resolve(out, `${label}.html`), result.report[1]);
      for (const [category, floor] of Object.entries(floors)) {
        const score = result.lhr.categories[category]?.score;
        console.log(`Lighthouse ${label} ${category}: ${score} (floor ${floor})`);
        if (typeof score !== "number" || score < floor) failures.push(`${label} ${category}: ${score} < ${floor}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(`Lighthouse budget failures: ${failures.join("; ")}`);
}
