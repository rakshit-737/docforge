/* ============================================================
   main.js — app state, UI, preview loop, exports
   ============================================================ */
"use strict";

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ---------------- storage (safe in sandboxed frames) ---------------- */
  const safeLS = {
    get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch { return false; } },
  };
  const LS_KEY = "docforge.v1";

  /* ---------------- defaults & templates ---------------- */
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const THEME_ACCENT = { modern: "#2563eb", executive: "#1f3a5f", academic: "#7f1d1d", minimal: "#111827" };
  const DEFAULTS = {
    title: "", subtitle: "", author: "", kicker: "", metaExtra: "", date: todayISO(),
    theme: "modern", accent: "#2563eb", page: "A4", orientation: "portrait", margins: "normal",
    cover: false, header: true, pageNums: true, numbered: false, justify: false, h1break: false,
    hardWrap: false, citeStyle: "ieee",
    borderStyle: "none", borderWeight: "medium", borderColor: "ink",
    fontHead: "theme", fontBody: "theme",
    baseSize: "11", lineSpacing: "default",
    /* Running header/footer slots and the two stamps (§8.2). All empty by
       default: the engine emits nothing for any of them until one is set, so
       a document that never asks renders exactly as it always did. */
    headerLeft: "", headerRight: "", footerLeft: "", footerRight: "",
    watermark: "", letterhead: "", letterheadSize: "14",
  };

  /* Projects saved before the border system grew options carry a single
     pageBorder key — translate it and never write it back. */
  function normalizeSettings(s) {
    const out = { ...DEFAULTS, ...s };
    if (s && s.pageBorder && s.borderStyle == null) {
      const map = {
        rule:   { borderStyle: "rule", borderColor: "ink" },
        double: { borderStyle: "double", borderColor: "ink" },
        frame:  { borderStyle: "thickthin", borderColor: "accent" },
      }[s.pageBorder];
      if (map) Object.assign(out, map);
    }
    delete out.pageBorder;
    return out;
  }

  /* ---------------- the template set ----------------
     One house style, taken from a real submitted lab report: a title page built in
     the body (so the page border frames it and every line stays editable), a `:::banner`
     plate carrying the subject, a particulars table, then numbered sections with
     captioned tables and figures. `cover` stays off in the paged templates — the built-in
     cover is a different, cleaner design and can carry neither the plate nor the table.
     The letter and the blank page keep their own shapes. */

  /* Every paged template opens on the same title page. Only the wording changes, so
     it lives here once: `org` the institution or company, `unit` the department line,
     `kicker` the course or client code, `title`/`sub` the document itself,
     `plateTitle`/`plateSub` the two lines of the plate, and `rows` the particulars
     table. */
  const titlePage = ({ org, unit, kicker, title, sub, plateTitle, plateSub, rows }) => `:::center
[**${org}**]{size=15}

${unit}
:::

---

:::center
[**${kicker}**]{size=11 caps}

[**${title}**]{size=22}

*${sub}*
:::

:::banner
${plateTitle}

${plateSub}
:::

| Particulars | Details |
| --- | --- |
${rows.map(([k, v]) => `| **${k}** | ${v} |`).join("\n")}

[pagebreak]
`;

  const TEMPLATES = {
    welcome: {
      label: "Quick tour (start here)",
      desc: "A five-minute working introduction to everything DocForge does.",
      patch: { title: "Welcome to DocForge", subtitle: "Type on the left — get a print-ready document on the right.", author: "Your Name", kicker: "Quick tour", theme: "modern", accent: "#2563eb", cover: false, header: true, pageNums: true },
      source: titlePage({
        org: "Your Organisation",
        unit: "Department or team",
        kicker: "Quick tour",
        title: "Welcome to DocForge",
        sub: "Type on the left — get a print-ready document on the right",
        plateTitle: "Everything in one file",
        plateSub: "Cover · Contents · Footnotes · Citations · Equations · Word export",
        rows: [["Author", "Your Name"], ["Reference", "DF-001"], ["Date", "Today"]],
      }) + `[toc]

# Getting started

Welcome! **DocForge** turns plain text into a polished, print-ready document — title page, automatic table of contents, running headers, footers and page numbers included.

Write with simple *Markdown* marks (the toolbar inserts them for you):

- \`# Heading\` starts a section — \`##\` and \`###\` for sub-sections
- **bold**, *italic*, \`code\`, ==highlighted== and ++underlined++, straight off the toolbar
- \`-\` for bullets, \`1.\` for numbered lists

:::tip Try it now
Change anything on the left and watch the pages update. Open **Settings** (top right) to switch the theme, accent colour, page size, typefaces and more.
:::

## The title page above

The page you just scrolled past is ordinary document content — nothing special about it. It is built from three marks you can reuse anywhere:

- \`:::center\` … \`:::\` centres a run of lines
- \`[text]{size=22 caps}\` sets one span's size, case, colour or typeface
- \`:::banner\` … \`:::\` prints the filled plate: first line large and white, the rest small in the accent tint

Settings → **Cover page** offers a designed alternative that numbers itself as front matter; use whichever suits the submission.

## Screenshot placeholders

Add a screenshot slot anywhere with a single line:

[screenshot: Homepage of the app, with the login form visible | #fig-home]

Leave it as a tidy placeholder in the printed PDF — or **click the box in the preview** to attach the real image. Either way it becomes a numbered figure you can point at from prose — "see [#fig-home]" — and the number keeps itself right.

## Tables, captions and callouts

[table: The furniture that makes a document feel finished | #tbl-kit]
| Feature | How | Notes |
| --- | --- | --- |
| Title plate | \`:::banner\` … \`:::\` | Filled band; first line large, the rest in the accent tint |
| Cover page | Settings → Cover page | Title, subtitle, author, date |
| Table of contents | \`[toc]\` | Real page numbers with dotted leaders |
| Captioned tables & figures | \`[table: …]\` above a table | Numbered; cross-reference with \`[#id]\` |
| Lists of figures / tables | \`[lof]\` / \`[lot]\` | Companions to the contents page |
| Page break | \`[pagebreak]\` | Forces a new page |
| Callouts | \`:::note\` … \`:::\` | note, tip, warning, important |

## The scholarly kit

Footnotes,[^1] citations (\`[@key]\` builds and numbers the References page for you) and typeset mathematics:

$$e^{i\\pi} + 1 = 0$$

[^1]: Written inline as \`[^1]\`, defined once anywhere — the note lands at the foot of the right page by itself.

# Exporting

## PDF

Hit **PDF** and choose *Save as PDF* in the print dialog. Margins, page numbers and the contents page are already handled — nothing to configure.

## Word

**Word** downloads a real \`.docx\`: styled headings, the title plate, tables, figures, footnotes, equations and an auto-updating table of contents. When Word asks to *update fields*, click **Yes** so the contents page fills itself in.

# Make it yours

1. Switch themes — Modern, Executive, Academic or Minimal
2. Pick an accent colour to match your brand or college
3. Choose typefaces — six embedded faces travel inside the file, and the whole classic Word specimen book is in the same menu
4. Start from a template in the **Templates** menu

:::note
Everything runs in this one file — no account, no internet, nothing to install. Your work autosaves in this browser; use **Save** for a backup file you can reopen anywhere.
:::
`,
    },
    /* The one template that names a system face rather than an embedded one. Coursework
       is submitted in Times New Roman because the rubric says so, and no lookalike
       passes for it — so the .docx names it and Word supplies its own copy, which is
       exact on any machine with Office. The cost is that it cannot travel inside the
       file the way the embedded faces do: on a device without it the preview and the
       printed PDF fall back, and the linter says so by name. Settings → Body typeface
       switches back to an embedded face for anyone who would rather have parity. */
    assignment: {
      label: "Assignment / lab report",
      desc: "Times New Roman, ruled title page, numbered tasks with captioned figures.",
      patch: { theme: "academic", accent: "#c2410c", numbered: true, justify: true, h1break: false, cover: false, header: true, pageNums: true, borderStyle: "thickthin", borderWeight: "bold", borderColor: "ink", fontHead: "sys:Times New Roman", fontBody: "sys:Times New Roman", title: "Cloud Architecture Design", subtitle: "Digital Assignment 1 · Hands-on lab experiment", kicker: "CSE3001", metaExtra: "Reg. No. 00XYZ0000", author: "Your Name" },
      source: titlePage({
        org: "Your Institute of Technology, City",
        unit: "School of Computer Science and Engineering",
        kicker: "CSE3001",
        title: "Cloud Architecture Design",
        sub: "Digital Assignment 1 · Hands-on lab experiment",
        plateTitle: "Object Storage Configuration",
        plateSub: "Bucket creation · Static website hosting · Lifecycle policies",
        rows: [
          ["Student Name", "Your Name"],
          ["Registration Number", "00XYZ0000"],
          ["Course Code & Title", "CSE3001 — Cloud Architecture Design"],
          ["Faculty", "Dr. Faculty Name"],
          ["Date of Submission", "31 July 2026"],
        ],
      }) + `[toc]

# Aim

State in two or three lines exactly what the experiment sets out to do — the service or technique configured, and the outcome that counts as success.

# Tools and Services Used

- **Service or tool** — one line on what it contributed to the experiment.
- **Second service** — the storage classes, libraries or SDKs the procedure depends on.
- **Management console / CLI** — the interface every configuration step was carried out in.
- **HTML / CSS** — the artefacts uploaded or produced, named exactly as they appear later.

# Deployment Details

[table: The configuration as deployed | #tbl-deploy]
| Setting | Value |
| --- | --- |
| Resource name | your-resource-name |
| Region | Region label — region-code |
| Endpoint | http://your-resource-name.example-endpoint.com |
| Entry / error document | index.html / error.html |
| Policy or rule | rule-name (applies to all objects) |

# Procedure

1. Signed in to the console and selected the region recorded in [#tbl-deploy].
2. Created the resource with the name above, noting any default that was changed.
3. Uploaded the artefacts listed in *Tools and Services Used*.
4. Enabled the feature under test and set its parameters.
5. Attached the access policy that the feature requires.
6. Verified the result end to end, including the failure path.
7. Created the lifecycle or scheduling rule and recorded its stages.
8. Captured a screenshot at every stage and compiled them below.

# Implementation and Observations

## Task 1 — Creating the resource

Describe what was created and why each non-default setting was chosen. One short paragraph per task, then the evidence.

[screenshot: Creation form showing the name, region and the setting that was changed | #fig-create]

## Task 2 — Uploading the artefacts

Name the files, their purpose and the outcome of the upload, then show it.

[screenshot: The uploaded objects listed in the console | #fig-upload]

## Task 3 — Enabling the feature

Record the exact parameters — index and error documents, ports, endpoints — and quote the endpoint the platform generated:

:::center
**http://your-resource-name.example-endpoint.com**
:::

[screenshot: The feature enabled, with the generated endpoint visible | #fig-enable]

## Task 4 — Access policy

Everything is private by default, so the first request returned *403 Forbidden*. The policy below grants exactly the one action the feature needs — no more:

\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "service:GetObject",
      "Resource": "arn:example:::your-resource-name/*"
    }
  ]
}
\`\`\`

[screenshot: The saved policy in the permissions tab | #fig-policy]

## Task 5 — Verification

State what was requested and what came back — including the deliberate failure case, which is the half most reports forget.

[screenshot: The working result, with the URL visible in the address bar | #fig-live]

[screenshot: The custom error page returned for a missing key | #fig-404]

## Task 6 — Lifecycle rule

Set the stages out as a table so the reader can check the arithmetic at a glance:

[table: Stages of rule-name | #tbl-lifecycle]
| Day 0 | Day 30 | Day 90 | Day 365 |
| :---: | :---: | :---: | :---: |
| Object uploaded (Standard) | Transition to Infrequent Access | Transition to Archive | Object expires |

[screenshot: The rule configuration showing the transition timeline | #fig-rule]

:::note Observation
Call out the single most important finding here so it is not lost in the prose — the unexpected default, the step that failed first, the number that did not match the estimate.
:::

# Result

The configuration is live and behaves as specified: the entry document is served at the root, the error document is returned for missing keys, and the rule is active on the resource. Reference the figures rather than re-describing them — [#fig-live] and [#fig-rule] carry the evidence.

# Conclusion

Summarise what was achieved against the aim, in the same order the aim stated it. Name the limitation you met and what you would measure next. The method follows the standard treatment [@clrs2009]; the report format follows [@ieee2021].[^1]

[^1]: Footnotes are written inline as \`[^1]\` and defined once below the paragraph — the note itself lands at the foot of the right page, in the PDF and in Word alike.

[references]

[@clrs2009]: T. H. Cormen, C. E. Leiserson, R. L. Rivest and C. Stein, *Introduction to Algorithms*, 3rd ed., MIT Press, 2009.
[@ieee2021]: IEEE, *IEEE Editorial Style Manual for Authors*, IEEE Publishing Operations, 2021.
`,
    },
    proposal: {
      label: "Business proposal",
      desc: "Title plate, scope, timeline and pricing tables, signature block.",
      patch: { theme: "executive", accent: "#1f3a5f", title: "Project Proposal", subtitle: "Scope, timeline and investment", kicker: "Your Company", metaExtra: "proposal@yourcompany.com", author: "Your Name", cover: false, header: true, pageNums: true, h1break: false, numbered: false, justify: true, borderStyle: "rule", borderWeight: "fine", borderColor: "ink" },
      source: titlePage({
        org: "Your Company Pvt Ltd",
        unit: "Professional services",
        kicker: "Proposal · REF-0001",
        title: "Project Proposal",
        sub: "Prepared for Client Name",
        plateTitle: "Platform Modernisation",
        plateSub: "Discovery · Build · Handover — eight weeks",
        rows: [
          ["Prepared for", "Client Name, Designation"],
          ["Prepared by", "Your Name, Your Company"],
          ["Reference", "REF-0001"],
          ["Valid until", "30 days from the date below"],
          ["Date", "31 July 2026"],
        ],
      }) + `# Executive Summary

One paragraph a busy decision-maker can read in thirty seconds: the problem, your solution, the outcome you're promising, and the investment required. Point them straight at the numbers — the packages in [#tbl-price] and the schedule in [#tbl-time].

:::tip Why us
One or two sentences on the single strongest reason you'll deliver — track record, speed, or specialist expertise.
:::

# The Problem

Describe the client's situation in their words. Quantify the cost of doing nothing where possible.[^1]

[^1]: Put supporting figures and sources in footnotes like this one, so the argument stays readable.

# Proposed Solution

Explain what you will build or deliver and how it solves the problem above. Keep the technology honest and the benefits concrete.

[screenshot: Mock-up or illustrative screen of the deliverable | #fig-mock]

# Scope & Deliverables

[table: What the engagement includes | #tbl-scope]
| Deliverable | Description | Included |
| --- | --- | --- |
| Item one | What the client receives | Yes |
| Item two | What the client receives | Yes |
| Item three | Optional add-on | Optional |

Anything not listed in [#tbl-scope] is out of scope for this engagement and can be quoted separately.

# Timeline

[table: Phases from kick-off to handover | #tbl-time]
| Phase | Work | Duration |
| --- | --- | --- |
| Discovery | Requirements and sign-off | 1 week |
| Build | Core delivery | 3 weeks |
| Handover | Testing, training, docs | 1 week |

# Investment

[table: Packages and pricing | #tbl-price]
| Package | What's included | Price |
| --- | --- | --- |
| Standard | Scope above | ₹ — |
| Extended | Scope + add-ons | ₹ — |

Payment terms: 50% to begin, 50% on delivery. Prices exclude applicable taxes.

# Next Steps

1. Reply confirming the package
2. We send the agreement and kick-off date
3. Discovery workshop within one week

:::note Validity
This proposal is valid for 30 days from the date on the title page.
:::

# Acceptance

Signing below confirms the selected package and the terms above.

| For Client Name | For Your Company |
| --- | --- |
| Name, designation | Name, designation |
| Signature | Signature |
| Date | Date |
`,
    },
    report: {
      label: "Project / status report",
      desc: "Title plate, status slip, metrics table, risks and an actions table.",
      patch: { theme: "modern", accent: "#2563eb", title: "Project Report", subtitle: "Progress, decisions and next steps", kicker: "Team / Department", author: "Your Name", metaExtra: "Reporting period", cover: false, header: true, pageNums: true, h1break: true, justify: false, borderStyle: "rule", borderWeight: "fine", borderColor: "accent" },
      source: titlePage({
        org: "Your Organisation",
        unit: "Team or department",
        kicker: "Status report · Q3",
        title: "Project Report",
        sub: "Progress, decisions and next steps",
        plateTitle: "Project Name",
        plateSub: "Scope on track · Schedule watch · Budget on track",
        rows: [
          ["Project", "Project Name"],
          ["Reporting period", "1 July — 31 July 2026"],
          ["Prepared by", "Your Name"],
          ["Distribution", "Steering group"],
          ["Date", "31 July 2026"],
        ],
      }) + `[toc]

# Executive Summary

Three to five sentences: where the project stands, the headline wins, the main risk, and the ask.

:::tip At a glance
**Scope** on track · **Schedule** watch — one milestone slipped · **Budget** on track
:::

# Progress This Period

## Completed

- Item shipped or finished
- Item shipped or finished

## In Progress

- Item under way, with expected completion

[screenshot: Latest build / dashboard state | #fig-dash]

# Metrics

Numbers first, narrative second — [#tbl-metrics] carries the period-on-period picture; the prose below it explains only what moved and why.

[table: Key metrics, period on period | #tbl-metrics]
| Metric | Last period | This period | Trend |
| --- | --- | --- | --- |
| Metric one | 0 | 0 | → |
| Metric two | 0 | 0 | ↑ |

# Risks & Issues

:::warning Top risk
Name the risk, its impact, and the mitigation you propose.
:::

# Decisions Needed

1. **Decision one** — the options, the trade-off, and your recommendation in one line
2. **Decision two** — the options, the trade-off, and your recommendation in one line

# Next Steps

[table: Actions for the coming period | #tbl-actions]
| Action | Owner | Due |
| --- | --- | --- |
| Action one | Name | Date |
| Action two | Name | Date |
`,
    },
    letter: {
      label: "Formal letter",
      desc: "Letterhead, subject line and a clean sign-off — no title page, no numbers.",
      patch: { theme: "minimal", accent: "#111827", cover: false, header: false, pageNums: false, numbered: false, h1break: false, hardWrap: true, justify: false, borderStyle: "none", title: "Letter", subtitle: "" },
      source: `[Your Name]{size=15 sc}
Your address line · City, PIN
your.email@example.com · +91 00000 00000

---

:::right
[DATE]
:::

**To**
Recipient Name
Designation, Organisation
Address line

**Subject: State the purpose of the letter in one line**

Dear Sir/Madam,

Opening paragraph: introduce yourself and state why you are writing, in two or three sentences.

Middle paragraph(s): the substance — facts, dates, reference numbers. Keep each paragraph to a single point.

Closing paragraph: state clearly what action or response you are requesting, and by when.

Thank you for your time and consideration.

Yours faithfully,

**Your Name**

Enclosures: 1. Document name · 2. Document name
`,
    },
    article: {
      label: "Article / essay",
      desc: "A quiet title page and a frame for a piece of writing that stands on its own.",
      patch: { theme: "minimal", accent: "#111827", title: "Article Title", subtitle: "A one-line standfirst that frames the piece", author: "Your Name", kicker: "Essay", cover: false, header: true, pageNums: true, h1break: false, justify: true, borderStyle: "none" },
      source: titlePage({
        org: "Publication or Series",
        unit: "Section or column",
        kicker: "Essay",
        title: "Article Title",
        sub: "A one-line standfirst that frames the piece",
        plateTitle: "The Question This Piece Answers",
        plateSub: "Stated once, in the fewest words that still make it interesting",
        rows: [["Author", "Your Name"], ["Length", "About 2,000 words"], ["Date", "31 July 2026"]],
      }) + `# Opening

Start with the idea, scene or question that earns the reader's attention. No throat-clearing.

# The Argument

Develop the piece one point per section. Quote sparingly and attribute clearly:[^1]

> A short, well-chosen quotation does more work than a paragraph of summary.

[^1]: Keep asides here, in footnotes, where they can't break the paragraph's stride.

# Counterpoint

Take the strongest objection seriously and answer it.

---

# Closing

Land the piece: return to the opening image or question and say what it means now.
`,
    },
    blank: {
      label: "Blank document",
      desc: "An empty page and nothing else.",
      patch: { title: "Untitled document", subtitle: "", kicker: "", metaExtra: "" },
      source: "",
    },
  };

  /* ---------------- state ---------------- */
  let state = { settings: { ...DEFAULTS }, source: "", attachments: {}, accentTouched: false };
  let lastContentEl = null;
  let previewer = null;
  let rendering = false, renderPending = false, renderTimer = null;
  let autosaveTimer = null;
  let zoomMode = "fit", zoomVal = 1;
  let imgMode = null; // {type:'insert'} | {type:'attach', idx}
  let preprintZoom = null, appTitle = null;

  const editor = $("#editor");
  const scaleWrap = $("#scaleWrap");
  const DOC_CSS = Engine.fontFaceCss() + (window.__KATEX_CSS__ || "") + (window.__DOC_CSS__ || "");

  /* The chrome wears the same faces as the document (see app.css) — register them
     on the app document itself so the UI never waits for the first preview render. */
  {
    const st = document.createElement("style");
    st.textContent = Engine.fontFaceCss();
    document.head.appendChild(st);
  }

  /* ---------------- toast & confirm ---------------- */
  function toast(msg, type, ms = 3400) {
    const d = document.createElement("div");
    d.className = "toast" + (type ? " " + type : "");
    d.textContent = msg;
    $("#toasts").appendChild(d);
    setTimeout(() => d.classList.add("out"), ms);
    setTimeout(() => d.remove(), ms + 400);
  }

  /* ---------------- dialog plumbing ----------------
     The overlays are real dialogs: focus moves in, Tab stays inside,
     Esc cancels, and focus returns to whatever opened them. */
  function ovFocusables(ov) {
    return [...ov.querySelectorAll("button, [href], input, select, textarea")]
      .filter(el => !el.disabled && el.offsetWidth > 0 && el.tabIndex !== -1);
  }
  function openOv(ov, onCancel) {
    ov.__cancel = onCancel || null;
    ov.__restore = document.activeElement;
    ov.classList.add("open");
    const modal = ov.querySelector(".modal");
    (ovFocusables(modal)[0] || modal).focus();
    ov.__trap = e => {
      if (e.key !== "Tab") return;
      const f = ovFocusables(modal);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    ov.addEventListener("keydown", ov.__trap);
  }
  function closeOv(ov) {
    ov.classList.remove("open");
    if (ov.__trap) { ov.removeEventListener("keydown", ov.__trap); ov.__trap = null; }
    ov.__cancel = null;
    const r = ov.__restore; ov.__restore = null;
    if (r && r.focus && document.contains(r)) r.focus();
  }
  function confirmModal(title, body) {
    return new Promise(res => {
      $("#cfTitle").textContent = title;
      $("#cfBody").textContent = body;
      const ov = $("#confirmOverlay");
      const done = v => { closeOv(ov); $("#cfYes").onclick = $("#cfNo").onclick = null; res(v); };
      openOv(ov, () => done(false));
      $("#cfYes").onclick = () => done(true);
      $("#cfNo").onclick = () => done(false);
    });
  }

  /* ---------------- repeat table headers across page breaks ----------------
     Paged.js fragments a table by shallow-cloning the ancestor chain
     table > tbody > tr (rebuildAncestors) and never carries the <thead> over,
     so each continuation page holds a headerless <table>. Every rebuilt
     ancestor is stamped data-split-from, which is the marker we key off.

     This runs in the `renderNode` hook, NOT afterPageLayout: renderNode fires
     while the page is still being filled, so the injected header's height is
     seen by findBreakToken and the last row spills to the next page instead of
     being clipped. Cloning the real <thead> (rather than faking a row) is also
     what restores the accent top/bottom rules, which doc.css declares on `th`. */
  class RepeatTableHeader extends Paged.Handler {
    renderNode(clone, node) {
      const el = clone && (clone.nodeType === 1 ? clone : clone.parentElement);
      if (!el || !el.closest) return;
      const destTable = el.closest("table[data-split-from]");
      if (!destTable) return;
      if (destTable.querySelector(":scope > thead")) return; // first fragment / already done
      const srcEl = node && (node.nodeType === 1 ? node : node.parentElement);
      const srcTable = srcEl && srcEl.closest && srcEl.closest("table");
      const srcHead = srcTable && srcTable.querySelector(":scope > thead");
      if (!srcHead || !srcHead.childElementCount) return;
      const head = srcHead.cloneNode(true);
      head.removeAttribute("data-ref");                       // keep Paged.js' data-ref
      head.querySelectorAll("[data-ref]").forEach(n => n.removeAttribute("data-ref"));
      head.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
      head.setAttribute("data-repeated-header", "");
      destTable.insertBefore(head, destTable.firstChild);
    }
  }
  Paged.registerHandlers(RepeatTableHeader);

  /* ---------------- folios ----------------
     Front matter (cover, contents) and the body run on two different sequences, and the
     body's "of N" must count body pages only. No CSS page counter can express either, so
     the folio text is written per page here and picked up by
     `@bottom-center { content: var(--df-foot) }` in Engine.dynamicCss(). */
  const ROMAN = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  function roman(n) {
    let out = "";
    for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
    return out;
  }

  class PageNumbering extends Paged.Handler {
    afterRendered(pages) {
      const els = [...pages].map(p => p.element || p).filter(el => el && el.classList);
      const kindOf = el =>
        el.classList.contains("pagedjs_cover_page") ? "cover" :
        el.classList.contains("pagedjs_front_page") ? "front" : "body";
      const kinds = els.map(kindOf);
      const bodyTotal = kinds.filter(k => k === "body").length;

      const folio = new Map(); // page element → the number the reader actually sees on it
      let f = 0, b = 0;
      els.forEach((el, i) => {
        let num = "", txt = "";
        if (kinds[i] === "front") { num = roman(++f); txt = num; }
        else if (kinds[i] === "body") { num = String(++b); txt = `Page ${num} of ${bodyTotal}`; }
        folio.set(el, num);
        // A quoted string, because it lands in a CSS `content:` value.
        el.style.setProperty("--df-foot", JSON.stringify(txt));
      });

      // Contents entries must quote that same folio, not the absolute sheet number —
      // otherwise the contents page and the printed footer disagree.
      const esc = s => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
      els.forEach(el => el.querySelectorAll('.toc a[href^="#"]').forEach(a => {
        const id = a.getAttribute("href").slice(1);
        const host = els.find(pe => pe.querySelector(`#${esc(id)}`));
        a.style.setProperty("--df-tocnum", JSON.stringify(host ? folio.get(host) || "" : ""));
      }));
    }
  }
  Paged.registerHandlers(PageNumbering);

  /* ---------------- footnote hardening ----------------
     pagedjs 0.4.3's footnote module has two defects. A note that is placed and then
     removed (because its call was pushed off the page) leaves --pagedjs-footnotes-height
     reserved, so the page keeps an empty strip — measured at up to 608px. And its
     margin/border maths runs parseInt over fractional computed values, leaving the area
     about a pixel short and clipping the descenders of the last line. */
  class FootnoteFix extends Paged.Handler {
    afterPageLayout(pageElement) {
      const area = pageElement.querySelector(".pagedjs_area");
      const cont = pageElement.querySelector(".pagedjs_footnote_content");
      const inner = pageElement.querySelector(".pagedjs_footnote_inner_content");
      if (!area || !cont || !inner) return;

      const reserved = parseFloat(area.style.getPropertyValue("--pagedjs-footnotes-height")) || 0;
      const notes = inner.querySelectorAll("[data-note='footnote']");

      if (!notes.length) {
        if (reserved > 0) area.style.setProperty("--pagedjs-footnotes-height", "0px");
        cont.classList.add("pagedjs_footnote_empty");
        return;
      }

      const px = v => parseFloat(v) || 0;
      const cs = getComputedStyle(cont);
      const chrome = px(cs.marginTop) + px(cs.marginBottom) + px(cs.paddingTop) +
        px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
      let needed = 0;
      notes.forEach(n => { needed += n.getBoundingClientRect().height; });
      const want = Math.ceil(needed + chrome);
      if (want > Math.ceil(reserved)) area.style.setProperty("--pagedjs-footnotes-height", want + "px");
      inner.style.height = "auto";
      cont.style.height = "auto";
    }
  }
  Paged.registerHandlers(FootnoteFix);

  /* ---------------- composing ticker ----------------
     While the press runs, the instrument cluster reads the page being
     set — truthful progress in the room's own language. doRender's
     final "N pages" overwrites it the moment the flow completes. */
  class ComposeTicker extends Paged.Handler {
    afterPageLayout(pageElement, page) {
      const n = page && typeof page.position === "number" ? page.position + 1 : null;
      if (n) $("#pgInfo").textContent = "p. " + n + "…";
    }
  }
  Paged.registerHandlers(ComposeTicker);

  /* ---------------- rendering ---------------- */
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(doRender, 420);
  }
  /* Direct manuscript edits keep the DOM current natively, so their rebuild
     can wait for a genuine pause — typing never races the compositor. */
  function scheduleLiveRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(doRender, 1300);
  }

  let pageTotal = 0;
  async function doRender() {
    if (rendering) { renderPending = true; return; }
    LiveEdit.flush();   // any manuscript edit still pending reaches the source first
    clearTimeout(renderTimer); renderTimer = null;
    rendering = true;
    $("#busy").classList.add("on");
    // where is the reader, and where is their caret? restored after the swap
    const view = LiveEdit.captureView();
    try {
      const { doc } = Engine.render(state.source, state.settings, state.attachments);
      lastContentEl = doc.querySelector(".content").cloneNode(true);
      const css = DOC_CSS + Engine.dynamicCss(state.settings);
      /* Compose the new galleys offscreen while the old ones stay on the
         stone — the reader never sees a blank deck, and the scroll container
         never collapses to zero (which is what threw them back to page 1). */
      const oldPreviewer = previewer;
      const oldStyles = [...document.querySelectorAll("style[data-pagedjs-inserted-styles]")];
      const stage = document.createElement("div");
      stage.style.cssText = "position:absolute;left:-100000px;top:0;";
      if (scaleWrap.style.zoom) stage.style.zoom = scaleWrap.style.zoom;   // measurements match the live deck
      $("#previewScroll").appendChild(stage);
      previewer = new Paged.Previewer();
      const url = URL.createObjectURL(new Blob([css], { type: "text/css" }));
      let flow;
      try { flow = await previewer.preview(doc.outerHTML, [url], stage); }
      finally { URL.revokeObjectURL(url); }
      /* The flow is final — edits re-render wholesale, so each page's
         resize-relayout observer must retire now: a direct manuscript edit
         resizes the live wrapper and the observer would re-walk a source
         tree our contenteditable mutations no longer match (findEndToken
         crashes on execCommand-inserted nodes that carry no data-ref). */
      try { (flow.pages || []).forEach(p => p.removeListeners && p.removeListeners()); } catch {}
      scaleWrap.innerHTML = "";
      while (stage.firstChild) scaleWrap.appendChild(stage.firstChild);
      stage.remove();
      if (oldPreviewer) { try { oldPreviewer.polisher.destroy(); } catch {} }
      oldStyles.forEach(s => { if (s.isConnected) s.remove(); });
      pageTotal = flow.total;
      $("#pgInfo").textContent = flow.total + (flow.total === 1 ? " page" : " pages");
      applyZoom();
      LiveEdit.arm();
      LiveEdit.restoreView(view);
      updatePageIndicator();
      refreshOutline();
    } catch (e) {
      console.error("[DocForge] render failed", e);
      toast("Preview error — check your markup", "warn");
    }
    rendering = false;
    $("#busy").classList.remove("on");
    if (renderPending) { renderPending = false; doRender(); }
  }

  /* the folio readout follows the reader: "p. 4 · 12 pages" */
  function updatePageIndicator() {
    if (!pageTotal) return;
    const top = $("#previewScroll").getBoundingClientRect().top + 8;
    const pages = scaleWrap.querySelectorAll(".pagedjs_page");
    let cur = 1;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].getBoundingClientRect().bottom > top) { cur = i + 1; break; }
    }
    $("#pgInfo").textContent = `p. ${cur} · ${pageTotal} page${pageTotal === 1 ? "" : "s"}`;
  }

  async function ensureFresh() {
    if (renderTimer) { await doRender(); }
    while (rendering) await new Promise(r => setTimeout(r, 80));
  }

  function applyZoom() {
    const pg = Engine.PAGES[state.settings.page] || Engine.PAGES.A4;
    const pgPx = pg.w * 96 / 25.4;
    const avail = $("#previewScroll").clientWidth - 44;
    const z = zoomMode === "fit" ? Math.min(1.35, Math.max(0.25, avail / pgPx)) : zoomVal;
    if (CSS.supports("zoom", "1")) { scaleWrap.style.zoom = z; scaleWrap.style.transform = ""; }
    else { scaleWrap.style.transform = `scale(${z})`; }
    $("#zoomPct").textContent = Math.round(z * 100) + "%";
  }

  /* ---------------- autosave & counts ---------------- */
  /* The document announces itself in the masthead, next to its save state. */
  function updateDocTitle() {
    const el = $("#docTitle");
    if (el) el.textContent = state.settings.title || "Untitled document";
  }

  /* ---------------- document history ----------------
     One undo history for the whole document, whichever side edited it.
     Entries are source snapshots; edits within ~a second amend the open
     entry so a typing burst is one undo step. Only real source changes
     record — settings tweaks and the synchronization between the two
     panes never mint history. */
  const hist = { stack: [], idx: -1, t: 0 };
  function recordSource() {
    if (hist.idx >= 0 && hist.stack[hist.idx] === state.source) return;
    const now = Date.now();
    if (hist.idx >= 0 && now - hist.t < 900) {
      hist.stack[hist.idx] = state.source;          // amend the open entry
    } else {
      hist.stack.length = ++hist.idx;               // truncate any redo tail
      hist.stack.push(state.source);
      if (hist.stack.length > 150) { hist.stack.shift(); hist.idx--; }
    }
    hist.t = now;
  }
  function applyHistory(src) {
    state.source = src;
    editor.value = src;
    markDirty();                                    // sees an equal snapshot — records nothing
    doRender();
  }
  function docUndo() { if (hist.idx > 0) { hist.t = 0; applyHistory(hist.stack[--hist.idx]); } }
  function docRedo() { if (hist.idx < hist.stack.length - 1) { hist.t = 0; applyHistory(hist.stack[++hist.idx]); } }

  function markDirty() {
    updateDocTitle();
    recordSource();
    clearTimeout(autosaveTimer);
    $("#saveState").textContent = "…";
    $("#saveState").className = "";
    autosaveTimer = setTimeout(() => {
      const ok = safeLS.set(LS_KEY, JSON.stringify({ v: 1, settings: state.settings, source: state.source, attachments: state.attachments, accentTouched: state.accentTouched }));
      const el = $("#saveState");
      if (ok) { el.textContent = "Autosaved"; el.className = "saved"; }
      else { el.textContent = "Autosave unavailable — use Save"; el.className = "err"; }
    }, 1100);
    updateCounts();
    refreshLint();
  }
  function updateCounts() {
    const w = (state.source.trim().match(/\S+/g) || []).length;
    const mins = Math.max(1, Math.round(w / 200));
    $("#wordCount").textContent = w + (w === 1 ? " word" : " words") + (w > 60 ? ` · ${mins} min read` : "");
    // A truly blank sheet gets a designed hint instead of a bare placeholder.
    $("#emptyState").hidden = !!state.source.trim();
  }

  /* ---------------- settings UI ---------------- */
  const FIELDS = {
    sTitle: "title", sSubtitle: "subtitle", sAuthor: "author", sKicker: "kicker",
    sMetaExtra: "metaExtra", sDate: "date",
    sHeaderLeft: "headerLeft", sHeaderRight: "headerRight",
    sFooterLeft: "footerLeft", sFooterRight: "footerRight",
    sWatermark: "watermark",
    /* The letterhead's value lives in a hidden field: the picker writes the
       data URL into it, and from there it is an ordinary setting like any
       other — one binding, one place it is read from. */
    sLetterhead: "letterhead",
  };
  const SELECTS = {
    sTheme: "theme", sPage: "page", sOrientation: "orientation", sMargins: "margins", sCiteStyle: "citeStyle",
    sBorderStyle: "borderStyle", sBorderWeight: "borderWeight", sBorderColor: "borderColor",
    sFontHead: "fontHead", sFontBody: "fontBody",
    sBaseSize: "baseSize", sLineSpacing: "lineSpacing",
    sLetterheadSize: "letterheadSize",
  };
  const TOGGLES = { tCover: "cover", tHeader: "header", tPageNums: "pageNums", tNumbered: "numbered", tJustify: "justify", tH1break: "h1break", tHardWrap: "hardWrap" };

  /* ---------------- font pickers ----------------
     The two settings selects and the toolbar's selection box all carry the same
     catalogue: the embedded faces (travel inside the file) and the classic Word
     menu (used from this device, written into the .docx by name). */
  /* Is this family actually available to the renderer?

     `document.fonts.check()` cannot answer that: it only knows the @font-face rules
     this document declared, and Chromium answers `true` for every other name — a
     family that does not exist anywhere included. Used for this, it marks all ~200
     Word faces as present, so picking one the machine lacks silently sets the preview
     and the printed PDF in a fallback while the .docx stays correct.

     So measure instead. A probe string is laid out in the family with a generic
     behind it; if the family resolves it overrides the generic and the width moves.
     Three generics with very different metrics are tried, because a face can happen
     to match one of them exactly (Arial *is* sans-serif on Windows). Widths are
     stable for the life of the page, so each answer is cached. */
  const fontInstalled = (() => {
    const cache = new Map();
    let ctx = null;
    try { ctx = document.createElement("canvas").getContext("2d"); } catch { /* no canvas */ }
    if (!ctx) return () => true;
    const PROBE = "mmmmmmmmmmlliWWMMwi0Oo—“”";
    const w = font => { ctx.font = font; return ctx.measureText(PROBE).width; };
    const GENERIC = ["monospace", "sans-serif", "serif"];
    const base = GENERIC.map(g => w(`72px ${g}`));
    return name => {
      const key = String(name || "");
      if (cache.has(key)) return cache.get(key);
      const q = `"${key.replace(/["\\]/g, "")}"`;
      const found = GENERIC.some((g, i) => w(`72px ${q}, ${g}`) !== base[i]);
      cache.set(key, found);
      return found;
    };
  })();

  function fontOptionsHtml(kind) {
    let h = kind === "settings" ? `<option value="theme">Theme default</option>` : `<option value="">Typeface…</option>`;
    h += `<optgroup label="Embedded — travel inside the file">`;
    for (const [key, face] of Object.entries(Engine.FACES)) {
      h += `<option value="${kind === "settings" ? key : face.name}">${face.label}</option>`;
    }
    h += `</optgroup>`;
    /* The Word census, sorted into the classic specimen-book groups. These print
       exactly in Word; the preview needs the face installed on this device. */
    const GROUPS = [
      ["sans", "Word · Sans serif"], ["serif", "Word · Serif"], ["mono", "Word · Monospace"],
      ["script", "Word · Script & handwriting"], ["display", "Word · Display & titling"],
    ];
    for (const [gk, label] of GROUPS) {
      h += `<optgroup label="${label}">`;
      for (const [name, fk] of Engine.WORD_CATALOG) {
        if (fk !== gk) continue;
        const miss = fontInstalled(name) ? "" : " · not on this device";
        h += `<option value="${kind === "settings" ? "sys:" + name : name}">${name}${miss}</option>`;
      }
      h += `</optgroup>`;
    }
    if (kind === "settings") h += `<option value="custom">Custom family…</option>`;
    return h;
  }

  /* A saved custom family ("sys:Whatever") must exist as an option or the select snaps
     back to the first entry when syncSettingsUI assigns it. */
  function ensureFontOption(sel, value) {
    if (!value || [...sel.options].some(o => o.value === value)) return;
    const o = document.createElement("option");
    o.value = value;
    const fam = value.replace(/^sys:/, "");
    o.textContent = fam + " (custom)" + (fontInstalled(fam) ? "" : " · not on this device");
    sel.insertBefore(o, sel.lastElementChild);
  }

  function buildFontSelects() {
    $("#sFontHead").innerHTML = fontOptionsHtml("settings");
    $("#sFontBody").innerHTML = fontOptionsHtml("settings");
    $("#tbFont").innerHTML = fontOptionsHtml("toolbar");
    $("#tbSize").innerHTML = `<option value="">Size…</option>` +
      [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map(n => `<option value="${n}">${n} pt</option>`).join("");
  }

  function syncSettingsUI() {
    for (const [id, k] of Object.entries(FIELDS)) $("#" + id).value = state.settings[k] || "";
    ensureFontOption($("#sFontHead"), state.settings.fontHead);
    ensureFontOption($("#sFontBody"), state.settings.fontBody);
    for (const [id, k] of Object.entries(SELECTS)) $("#" + id).value = state.settings[k];
    for (const [id, k] of Object.entries(TOGGLES)) $("#" + id).checked = !!state.settings[k];
    $("#cAccent").value = state.settings.accent;
    const lh = state.settings.letterhead || "";
    const lhImg = $("#sLetterheadPreview");
    lhImg.hidden = !lh;
    if (lh) lhImg.src = lh;
    $("#sLetterheadClear").hidden = !lh;
    $("#sLetterheadSizeField").hidden = !lh;
    $("#sLetterheadPick").textContent = lh ? "Replace…" : "Choose an image…";
    $$(".sw").forEach(sw => {
      const on = sw.dataset.c === state.settings.accent;
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-pressed", String(on));
    });
    updateDocTitle();
  }

  function bindSettings() {
    for (const [id, k] of Object.entries(FIELDS)) $("#" + id).addEventListener("input", e => {
      state.settings[k] = e.target.value; markDirty(); scheduleRender();
    });
    for (const [id, k] of Object.entries(SELECTS)) $("#" + id).addEventListener("change", e => {
      let v = e.target.value;
      if ((k === "fontHead" || k === "fontBody") && v === "custom") {
        const name = (window.prompt("Font family name, exactly as installed (e.g. Segoe UI Semibold):", "") || "").trim();
        if (!name) { syncSettingsUI(); return; }
        v = "sys:" + name;
        ensureFontOption(e.target, v);
      }
      state.settings[k] = v;
      if (k === "theme" && !state.accentTouched) {
        state.settings.accent = THEME_ACCENT[e.target.value] || DEFAULTS.accent;
        syncSettingsUI();
      }
      markDirty(); scheduleRender();
    });
    for (const [id, k] of Object.entries(TOGGLES)) $("#" + id).addEventListener("change", e => {
      state.settings[k] = e.target.checked; markDirty(); scheduleRender();
    });
    $$(".sw").forEach(sw => sw.addEventListener("click", () => {
      state.settings.accent = sw.dataset.c; state.accentTouched = true;
      syncSettingsUI(); markDirty(); scheduleRender();
    }));
    $("#cAccent").addEventListener("input", e => {
      state.settings.accent = e.target.value; state.accentTouched = true;
      $$(".sw").forEach(s => s.classList.remove("on"));
      markDirty(); scheduleRender();
    });

    /* The letterhead: a picker in front, an ordinary setting behind. Held to
       PNG/JPEG under 512 KB — it travels inside the document, the project
       file and every export, and a .docx header is no place for a
       photograph. */
    const lhInput = $("#lhInput");
    $("#sLetterheadPick").addEventListener("click", () => lhInput.click());
    $("#sLetterheadClear").addEventListener("click", () => {
      $("#sLetterhead").value = "";
      state.settings.letterhead = "";
      syncSettingsUI(); markDirty(); scheduleRender();
    });
    lhInput.addEventListener("change", () => {
      const file = lhInput.files && lhInput.files[0];
      lhInput.value = "";
      if (!file) return;
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        toast("A letterhead must be a PNG or a JPEG — Word carries no other kind", "warn");
        return;
      }
      if (file.size > 512 * 1024) {
        toast(`That image is ${Math.round(file.size / 1024)} KB; a letterhead has to stay under 512 KB`, "warn");
        return;
      }
      const fr = new FileReader();
      fr.onerror = () => toast("That image could not be read", "warn");
      fr.onload = () => {
        $("#sLetterhead").value = String(fr.result);
        state.settings.letterhead = String(fr.result);
        syncSettingsUI(); markDirty(); scheduleRender();
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------- editor toolbar ---------------- */
  function setSel(start, end) { editor.focus(); editor.setSelectionRange(start, end); }
  function replaceRange(s, e, text) {
    editor.setRangeText(text, s, e, "end");
    state.source = editor.value; markDirty(); scheduleRender();
  }
  function surround(pre, post, ph) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    const sel = editor.value.slice(s, e) || ph;
    editor.focus();
    editor.setRangeText(pre + sel + post, s, e, "select");
    setSel(s + pre.length, s + pre.length + sel.length);
    state.source = editor.value; markDirty(); scheduleRender();
  }
  function linePrefix(prefix, numbered) {
    const v = editor.value;
    let s = editor.selectionStart, e = editor.selectionEnd;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    let le = v.indexOf("\n", e); if (le === -1) le = v.length;
    const seg = v.slice(ls, le).split("\n");
    const out = seg.map((l, i) => {
      const clean = l.replace(/^(\s*)(#{1,4}\s+|[-*]\s+|\d+\.\s+|>\s+)?/, "$1");
      return numbered ? clean.replace(/^(\s*)/, `$1${i + 1}. `) : clean.replace(/^(\s*)/, "$1" + prefix);
    }).join("\n");
    editor.focus();
    editor.setRangeText(out, ls, le, "end");
    state.source = editor.value; markDirty(); scheduleRender();
  }
  function insertBlock(text) {
    const v = editor.value, s = editor.selectionStart;
    const before = v.slice(0, s), after = v.slice(editor.selectionEnd);
    const pre = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const post = after && !after.startsWith("\n") ? "\n\n" : "\n";
    editor.focus();
    editor.setRangeText(pre + text + post, s, editor.selectionEnd, "end");
    state.source = editor.value; markDirty(); scheduleRender();
  }

  /* Like surround(), but leading/trailing whitespace stays outside the marks —
     `++text ++` would not tokenize. */
  function wrapInline(pre, post, ph) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    const raw = editor.value.slice(s, e);
    const lead = (raw.match(/^\s*/) || [""])[0];
    const trail = raw.slice(lead.length).match(/\s*$/)[0];
    const core = raw.slice(lead.length, raw.length - trail.length) || ph;
    editor.focus();
    editor.setRangeText(lead + pre + core + post + trail, s, e, "select");
    const at = s + lead.length + pre.length;
    setSel(at, at + core.length);
    state.source = editor.value; markDirty(); scheduleRender();
  }

  function scriptWrap(mark, ph) {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (/\s/.test(sel)) { toast("Sub/superscript can't contain spaces", "warn"); return; }
    wrapInline(mark, mark, ph);
  }

  /* UPPER → lower → Title, judged from what the selection currently is.
     Attachment keys and URLs are case-sensitive machinery, not prose — skip them. */
  const CASE_SAFE = /(\|\s*img:[A-Za-z0-9]+|\]\([^)\n]*\)|https?:\/\/\S+)/g;
  function mapProse(sel, fn) {
    return sel.split(CASE_SAFE).map((part, i) => (i % 2 ? part : fn(part))).join("");
  }
  function cycleCase() {
    const s = editor.selectionStart, e = editor.selectionEnd;
    const sel = editor.value.slice(s, e);
    if (!sel || !/[a-z]/i.test(sel)) { toast("Select some text first", "warn"); return; }
    let next;
    if (sel === mapProse(sel, t => t.toUpperCase())) next = mapProse(sel, t => t.toLowerCase());
    else if (sel === mapProse(sel, t => t.toLowerCase())) {
      next = mapProse(sel, t => t.replace(/([a-z])([a-z']*)/gi, (m, a, b) => a.toUpperCase() + b.toLowerCase()));
    } else next = mapProse(sel, t => t.toUpperCase());
    editor.focus();
    editor.setRangeText(next, s, e, "select");
    state.source = editor.value; markDirty(); scheduleRender();
  }

  /* Word's "clear formatting": peel every character-level mark off the selection.
     Runs a few passes so nested marks unwrap fully. */
  function clearFormatting() {
    const s = editor.selectionStart, e = editor.selectionEnd;
    let sel = editor.value.slice(s, e);
    if (!sel) { toast("Select some text first", "warn"); return; }
    for (let i = 0; i < 4; i++) {
      sel = sel
        .replace(/\[([^\[\]{}\n]+)\]\{[^}\n]*\}/g, "$1")
        .replace(/\*\*([^*\n]+)\*\*/g, "$1")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
        .replace(/\+\+([^+\n]+)\+\+/g, "$1")
        .replace(/~~([^~\n]+)~~/g, "$1")
        .replace(/==(?:\{[A-Za-z]+\})?([^=\n]+)==/g, "$1")
        .replace(/\^([^\s^]+)\^/g, "$1")
        .replace(/(^|[^~])~([^\s~]+)~(?!~)/g, "$1$2")
        .replace(/`([^`\n]+)`/g, "$1");
    }
    editor.focus();
    editor.setRangeText(sel, s, e, "select");
    state.source = editor.value; markDirty(); scheduleRender();
  }

  /* Wrap the selected lines in an alignment container; a second press unwraps it. */
  function wrapAlign(dir) {
    const v = editor.value;
    const s = editor.selectionStart, e = editor.selectionEnd;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    let le = v.indexOf("\n", e); if (le === -1) le = v.length;
    const prevLs = ls >= 2 ? v.lastIndexOf("\n", ls - 2) + 1 : -1;
    const prevLine = prevLs >= 0 ? v.slice(prevLs, ls - 1) : "";
    const nextLe0 = le < v.length ? v.indexOf("\n", le + 1) : -1;
    const nextLe = nextLe0 === -1 ? v.length : nextLe0;
    const nextLine = le < v.length ? v.slice(le + 1, nextLe) : "";
    editor.focus();
    if (new RegExp(`^:::${dir}\\s*$`, "i").test(prevLine) && /^:::\s*$/.test(nextLine)) {
      // Replace up to (not past) the newline after ::: — the next paragraph keeps its break.
      editor.setRangeText(v.slice(ls, le), prevLs, nextLe, "select");
    } else {
      editor.setRangeText(`:::${dir}\n${v.slice(ls, le)}\n:::`, ls, le, "select");
    }
    state.source = editor.value; markDirty(); scheduleRender();
  }

  /* The four run-level controls that have no execCommand behind them. Each styles the
     manuscript selection where there is one, and otherwise wraps the source — so the
     same button works from either pane, which is what every other toolbar mark does.
     The span is built exactly as engine.js builds it (same data-* keys, same inline
     style), so the galley shows the change at once and it round-trips unchanged. */
  const styleRun = (data, style) => LiveEdit.styleSelection({ tag: "span", className: "dfspan", data, style });

  const applyHl = name => {
    if (LiveEdit.styleSelection({ tag: "mark", data: { hl: name }, style: `background:#${Engine.HL_COLORS[name] || "FFFF00"}` })) return;
    wrapInline(name === "yellow" ? "==" : `=={${name}}`, "==", "highlighted text");
  };
  const applyColor = hexc => {
    if (styleRun({ color: hexc.replace("#", "").toUpperCase() }, `color:${hexc}`)) return;
    wrapInline("[", `]{color=${hexc}}`, "coloured text");
  };
  const applyFont = name => {
    if (styleRun({ font: name }, `font-family:${Engine.sysStack(name)}`)) return;
    wrapInline("[", `]{font="${name}"}`, "text");
  };
  const applySize = pt => {
    if (styleRun({ size: pt }, `font-size:${pt}pt`)) return;
    wrapInline("[", `]{size=${pt}}`, "text");
  };

  const TOOL_ACTS = {
    bold: () => surround("**", "**", "bold text"),
    italic: () => surround("*", "*", "italic text"),
    underline: () => wrapInline("++", "++", "underlined text"),
    strike: () => wrapInline("~~", "~~", "struck-out text"),
    sub: () => scriptWrap("~", "2"),
    sup: () => scriptWrap("^", "2"),
    case: cycleCase,
    clearfmt: clearFormatting,
    alignleft: () => wrapAlign("left"),
    aligncenter: () => wrapAlign("center"),
    alignright: () => wrapAlign("right"),
    alignjustify: () => wrapAlign("justify"),
    code: () => surround("`", "`", "code"),
    h1: () => linePrefix("# "), h2: () => linePrefix("## "), h3: () => linePrefix("### "),
    ul: () => linePrefix("- "), ol: () => linePrefix("", true), quote: () => linePrefix("> "),
    link: () => surround("[", "](https://)", "link text"),
    table: () => insertBlock("| Column | Column | Column |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |"),
    equation: () => insertBlock("$$\nE = mc^2\n$$"),
    footnote: insertFootnote,
    citation: insertCitation,
    callout: () => insertBlock(":::note Optional title\nYour note text here.\n:::"),
    shot: () => insertBlock("[screenshot: Describe what the screenshot shows]"),
    image: () => { imgMode = { type: "insert" }; $("#imgInput").click(); },
    pagebreak: () => insertBlock("[pagebreak]"),
    toc: () => insertBlock("[toc]"),
    hr: () => insertBlock("---"),
    codeblock: () => insertBlock("```\ncode here\n```"),
  };

  /* ---------------- screenshot attachments ---------------- */
  function newKey() { return "i" + Math.random().toString(36).slice(2, 8); }

  function processImageFile(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const img = new Image();
        img.onerror = rej;
        img.onload = () => {
          const MAX = 1600;
          let { width: w, height: h } = img;
          const isPng = /png|gif/i.test(file.type);
          if (w > MAX || h > MAX) {
            const k = MAX / Math.max(w, h);
            const cv = document.createElement("canvas");
            cv.width = Math.round(w * k); cv.height = Math.round(h * k);
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            res({ dataUrl: cv.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92), w: cv.width, h: cv.height });
          } else {
            res({ dataUrl: fr.result, w, h });
          }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function rewriteShotLine(idx, key) {
    const lines = state.source.split("\n");
    let n = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(Engine.RE_SHOT);
      if (!m) continue;
      n++;
      if (n !== idx) continue;
      const cap = (m[1] || "").trim();
      lines[i] = "[screenshot" + (cap ? ": " + cap : "") + (key ? " | img:" + key : "") + "]";
      state.source = lines.join("\n");
      editor.value = state.source;
      return m[2] || null; // previous key
    }
    return null;
  }

  function bindImageInput() {
    $("#imgInput").addEventListener("change", async e => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file || !imgMode) return;
      try {
        const att = await processImageFile(file);
        const key = newKey();
        state.attachments[key] = att;
        if (imgMode.type === "insert") {
          const cap = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
          insertBlock(`[screenshot: ${cap} | img:${key}]`);
        } else {
          const old = rewriteShotLine(imgMode.idx, key);
          if (old) delete state.attachments[old];
          markDirty(); scheduleRender();
        }
        toast("Image attached");
      } catch { toast("Could not read that image", "warn"); }
      imgMode = null;
    });
  }

  function bindShotClicks() {
    const menu = $("#imgMenu");
    let menuIdx = null, menuKey = null;
    scaleWrap.addEventListener("click", e => {
      const fig = e.target.closest("figure.shot");
      if (!fig) return;
      menuIdx = +fig.dataset.idx;
      menuKey = fig.dataset.key || null;
      const hasImg = menuKey && state.attachments[menuKey];
      $("#imAttach").style.display = hasImg ? "none" : "block";
      $("#imReplace").style.display = hasImg ? "block" : "none";
      $("#imRemove").style.display = hasImg ? "block" : "none";
      menu.style.display = "block";
      const mw = 180, mh = 120;
      menu.style.left = Math.min(e.clientX, innerWidth - mw) + "px";
      menu.style.top = Math.min(e.clientY, innerHeight - mh) + "px";
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("#imgMenu") && !e.target.closest("figure.shot")) menu.style.display = "none";
    }, true);
    const close = () => { menu.style.display = "none"; };
    $("#imAttach").onclick = $("#imReplace").onclick = () => { close(); imgMode = { type: "attach", idx: menuIdx }; $("#imgInput").click(); };
    $("#imRemove").onclick = () => {
      close();
      const old = rewriteShotLine(menuIdx, null);
      if (old) delete state.attachments[old];
      markDirty(); scheduleRender();
      toast("Image removed — placeholder kept");
    };
  }

  /* ---------------- highlight & text-colour menus ---------------- */
  function bindFloatingToolbar() {
    const ftb = $("#floatTb");
    if (!ftb) return;

    function updateFtb() {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        ftb.hidden = true;
        return;
      }
      const range = sel.getRangeAt(0);
      if (!scaleWrap.contains(range.commonAncestorContainer)) {
        ftb.hidden = true;
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        ftb.hidden = true;
        return;
      }

      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) {
        ftb.hidden = true;
        return;
      }

      ftb.hidden = false;
      const ftbW = ftb.offsetWidth || 210;
      const ftbH = ftb.offsetHeight || 32;

      let top = rect.top - ftbH - 8;
      if (top < 10) top = rect.bottom + 8;

      let left = rect.left + (rect.width / 2) - (ftbW / 2);
      left = Math.max(10, Math.min(innerWidth - ftbW - 10, left));

      ftb.style.top = top + "px";
      ftb.style.left = left + "px";
    }

    let ftbDebounce = 0;
    document.addEventListener("selectionchange", () => {
      clearTimeout(ftbDebounce);
      ftbDebounce = setTimeout(updateFtb, 120);
    });

    $("#previewScroll")?.addEventListener("scroll", () => { ftb.hidden = true; }, { passive: true });

    ftb.addEventListener("click", e => {
      const btn = e.target.closest("[data-fact]");
      if (!btn) return;
      const act = btn.dataset.fact;
      if (act === "bold") document.execCommand("bold");
      else if (act === "italic") document.execCommand("italic");
      else if (act === "underline") document.execCommand("underline");
      else if (act === "strike") document.execCommand("strikeThrough");
      else if (act === "hl") document.execCommand("hiliteColor", false, "#f5d90a");
      else if (act === "clearfmt") document.execCommand("removeFormat");
      else if (act === "link") {
        const url = prompt("Link URL:", "https://");
        if (url) document.execCommand("createLink", false, url);
      }
      scaleWrap.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(updateFtb, 50);
    });
  }

  function bindColorMenus() {
    const hlMenu = $("#hlMenu"), fcMenu = $("#fcMenu");
    const openAt = (menu, btn) => {
      const r = btn.getBoundingClientRect();
      menu.style.display = "block";
      menu.style.left = Math.min(r.left, innerWidth - menu.offsetWidth - 8) + "px";
      menu.style.top = (r.bottom + 6) + "px";
    };
    const closeBoth = () => { hlMenu.style.display = "none"; fcMenu.style.display = "none"; };
    $("#hlGrid").innerHTML = Object.entries(Engine.HL_COLORS).map(([k, v]) =>
      `<button type="button" class="pm-sw" data-k="${k}" title="${k}" aria-label="Highlight: ${k}" style="background:#${v}"></button>`).join("");
    const FC = ["#c00000", "#e36c09", "#bf8f00", "#1a7f37", "#0f766e", "#2563eb", "#1f3a5f", "#6d28d9", "#c026d3", "#64748b", "#111827", "#000000"];
    const FC_NAMES = ["dark red", "orange", "dark yellow", "green", "teal", "blue", "navy", "violet", "magenta", "slate", "ink", "black"];
    $("#fcGrid").innerHTML = FC.map((c, i) =>
      `<button type="button" class="pm-sw" data-c="${c}" title="${FC_NAMES[i]}" aria-label="Text colour: ${FC_NAMES[i]}" style="background:${c}"></button>`).join("");
    /* opening from the keyboard lands on the first swatch; Esc hands focus back */
    const openMenu = (menu, btn) => { openAt(menu, btn); const f = menu.querySelector(".pm-sw"); if (f) f.focus(); };
    $("#tbHl").onclick = e => { e.stopPropagation(); fcMenu.style.display = "none"; openMenu(hlMenu, e.currentTarget); };
    $("#tbFc").onclick = e => { e.stopPropagation(); hlMenu.style.display = "none"; openMenu(fcMenu, e.currentTarget); };
    $("#hlGrid").onclick = e => { const k = e.target.dataset.k; if (!k) return; closeBoth(); applyHl(k); };
    $("#fcGrid").onclick = e => { const c = e.target.dataset.c; if (!c) return; closeBoth(); applyColor(c); };
    $("#fcCustom").addEventListener("change", e => { closeBoth(); applyColor(e.target.value); });
    document.addEventListener("click", e => {
      if (!e.target.closest(".popmenu") && !e.target.closest("#tbHl") && !e.target.closest("#tbFc")) closeBoth();
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      const wasHl = hlMenu.style.display === "block", wasFc = fcMenu.style.display === "block";
      if (!wasHl && !wasFc) return;
      closeBoth();
      (wasHl ? $("#tbHl") : $("#tbFc")).focus();
    });
    /* Selection typeface / size — the select snaps back to its placeholder after use. */
    $("#tbFont").addEventListener("change", e => { const v = e.target.value; e.target.value = ""; if (v) applyFont(v); });
    $("#tbSize").addEventListener("change", e => { const v = e.target.value; e.target.value = ""; if (v) applySize(v); });
  }

  /* ---------------- project save / open ---------------- */
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    // Remove synchronously — a stray element after the page stack adds a blank
    // page to any print that happens before a timeout would have fired.
    const url = a.href;
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const safeName = () => (state.settings.title || "document").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "document";

  /* The MarkItDown hand-back: whatever came in (.docx, .pdf, .xlsx, .pptx,
     .epub, .ipynb, …) already lives here as Markdown — this returns it as a
     plain .md file. */
  function exportMd() {
    LiveEdit.flush();
    downloadBlob(new Blob([state.source], { type: "text/markdown" }), safeName() + ".md");
    toast("Markdown file downloaded — the document, as plain .md");
  }

  function saveProject() {
    LiveEdit.flush();
    const data = { app: "docforge", v: 1, savedAt: new Date().toISOString(), settings: state.settings, source: state.source, attachments: state.attachments };
    downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), safeName() + ".docforge.json");
    toast("Project file saved");
  }
  function bindProjectInput() {
    $("#projInput").addEventListener("change", e => {
      const f = e.target.files[0];
      e.target.value = "";
      if (f) importFile(f);
    });
  }

  /* ---------------- import: project / Word / PDF / Markdown ---------------- */
  function openProjectFile(f) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (d.app !== "docforge") throw new Error("not a DocForge file");
        state.settings = normalizeSettings(d.settings);
        state.source = d.source || "";
        state.attachments = d.attachments || {};
        state.accentTouched = true;
        editor.value = state.source;
        syncSettingsUI(); markDirty(); doRender();
        toast("Project opened");
      } catch { toast("That doesn't look like a DocForge project file", "warn"); }
    };
    fr.readAsText(f);
  }

  /* An imported (non-project) image arrives as a data URL, not a File — same
     downscale rules as processImageFile so attachments stay autosave-sized. */
  function dataUrlAttachment(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const MAX = 1600;
        const { width: w, height: h } = img;
        if (w > MAX || h > MAX) {
          const k = MAX / Math.max(w, h);
          const cv = document.createElement("canvas");
          cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          const isPng = /^data:image\/(png|gif)/i.test(dataUrl);
          res({ dataUrl: cv.toDataURL(isPng ? "image/png" : "image/jpeg", 0.92), w: cv.width, h: cv.height });
        } else res({ dataUrl, w, h });
      };
      img.src = dataUrl;
    });
  }

  async function importDocxFile(f) {
    const { html, messages } = await DocxImport.toHtml(await f.arrayBuffer());
    const doc = new DOMParser().parseFromString(html, "text/html");
    const atts = {};
    // Embedded pictures become numbered figures; formats the browser can't decode
    // (EMF/WMF vector clips, mostly) are dropped rather than left as broken tags.
    for (const img of [...doc.querySelectorAll('img[src^="data:"]')]) {
      try {
        const att = await dataUrlAttachment(img.src);
        const key = newKey();
        atts[key] = att;
        img.dataset.dfKey = key;
      } catch { img.remove(); }
    }
    const md = htmlToMd(doc.body.innerHTML);
    if (!md.trim()) throw new Error("That Word file appears to be empty");
    // Images that didn't survive the conversion (table cells, undecodable formats)
    // must not ride along as orphaned bytes in every autosave.
    for (const key of Object.keys(atts)) if (!md.includes("img:" + key)) delete atts[key];
    state.source = md;
    state.attachments = atts;
    if (messages && messages.length) console.warn("[DocForge] docx import notes:", messages);
  }

  async function importPdfFile(f) {
    toast("Reading PDF — a large file can take a few seconds…");
    const { source, warnings } = await PdfImport.toMarkdown(await f.arrayBuffer());
    state.source = source;
    state.attachments = {};
    (warnings || []).slice(0, 2).forEach(w => toast(w, "warn"));
  }

  /* A PDF can be worked on two ways — edited in place (layout preserved, overlay
     edits) or converted to a reflowed DocForge document. Ask which. */
  function pdfChoice(name) {
    return new Promise(res => {
      const ov = $("#pdfChoiceOverlay");
      $("#pcTitle").textContent = name;
      const done = v => {
        closeOv(ov);
        $("#pcEdit").onclick = $("#pcConvert").onclick = $("#pcCancel").onclick = null;
        res(v);
      };
      openOv(ov, () => done(null));
      $("#pcEdit").onclick = () => done("edit");
      $("#pcConvert").onclick = () => done("convert");
      $("#pcCancel").onclick = () => done(null);
    });
  }

  async function importFile(f) {
    const ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
    if (ext === "json") return openProjectFile(f);
    if (ext === "doc") return toast("Old binary .doc — open it in Word and save as .docx first", "warn");
    // An image picked through Open becomes an attached figure, same as dropping it.
    if (/^image\//.test(f.type)) {
      try {
        const att = await processImageFile(f);
        const key = newKey();
        state.attachments[key] = att;
        const cap = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
        insertBlock(`[screenshot: ${cap} | img:${key}]`);
        toast("Image added as a figure");
      } catch { toast("Could not read that image", "warn"); }
      return;
    }
    if (!["docx", "pdf", "md", "markdown", "txt", "html", "htm", "csv", "tsv", "xlsx", "pptx", "epub", "ipynb"].includes(ext)) {
      return toast("Can't import that file type", "warn");
    }
    if (ext === "pdf") {
      const mode = await pdfChoice(f.name);
      if (!mode) return;
      if (mode === "edit") {
        try {
          await PdfEditor.open(await f.arrayBuffer(), f.name);
          document.body.classList.add("pdf-mode");
          toast("Double-click any text to rewrite it — the layout stays exactly as printed");
        } catch (err) {
          console.error("[DocForge] pdf edit open failed", err);
          toast(err && err.message ? err.message : "Could not open that PDF", "warn");
        }
        return;
      }
      // "convert" falls through to the replace-confirm below
    }
    if (!await confirmModal(`Import “${f.name}”?`,
      "The imported document will replace the editor contents. Your current work stays in autosave until you type again — use Save first if you want a backup file.")) return;
    // Heavy conversions can take a few seconds — say so the moment work begins.
    if (["docx", "pdf", "xlsx", "pptx", "epub"].includes(ext)) toast(`Reading “${f.name}”…`, null, 1800);
    try {
      if (ext === "docx") await importDocxFile(f);
      else if (ext === "pdf") await importPdfFile(f);
      else if (ext === "html" || ext === "htm") { state.source = htmlToMd(await f.text()) || ""; state.attachments = {}; }
      else if (ext === "csv" || ext === "tsv") { state.source = FileImport.csv(await f.text()); state.attachments = {}; }
      else if (ext === "xlsx") { state.source = await FileImport.xlsx(await f.arrayBuffer()); state.attachments = {}; }
      else if (ext === "pptx") { state.source = await FileImport.pptx(await f.arrayBuffer()); state.attachments = {}; }
      else if (ext === "epub") { state.source = await FileImport.epub(await f.arrayBuffer(), htmlToMd); state.attachments = {}; }
      else if (ext === "ipynb") { state.source = FileImport.ipynb(await f.text()); state.attachments = {}; }
      else { state.source = await f.text(); state.attachments = {}; }
      state.settings.title = f.name.replace(/\.[a-z0-9]+$/i, "");
      editor.value = state.source;
      syncSettingsUI(); markDirty(); doRender();
      toast(`Imported ${f.name} — now fully editable`);
    } catch (err) {
      console.error("[DocForge] import failed", err);
      toast(err && err.message ? err.message : "Couldn't read that file — re-save it and try importing again", "warn");
    }
  }

  function applyTemplate(id) {
    const t = TEMPLATES[id];
    if (!t) return;
    state.settings = { ...DEFAULTS, ...t.patch, date: todayISO() };
    state.source = t.source.replace("[DATE]", Engine.fmtDate(todayISO()));
    state.attachments = {};
    state.accentTouched = false;
    editor.value = state.source;
    syncSettingsUI(); markDirty(); doRender();
  }

  /* ---------------- PDF in-place editor chrome ---------------- */
  function bindPdfEditor() {
    PdfEditor.hooks = { toast, confirm: confirmModal };
    $("#peClose").onclick = async () => {
      if (PdfEditor.hasEdits() && !await confirmModal("Leave PDF editing?",
        "Your overlay edits live only in this view — export the PDF first if you want to keep them.")) return;
      await PdfEditor.close();
      document.body.classList.remove("pdf-mode");
    };
    $("#peExport").onclick = async () => {
      const btn = $("#peExport");
      const label = btn.innerHTML;
      btn.disabled = true; btn.classList.add("busy");
      btn.innerHTML = `<span class="btnspin"></span> Exporting…`;
      try {
        const { blob, name } = await PdfEditor.exportPdf();
        downloadBlob(blob, name);
        toast("Edited PDF downloaded — original layout intact underneath");
      } catch (e) {
        console.error("[DocForge] pdf edit export failed", e);
        toast("PDF export failed — your edits are still here; try again", "warn");
      }
      btn.disabled = false; btn.classList.remove("busy");
      btn.innerHTML = label;
    };
  }
  const inPdfMode = () => document.body.classList.contains("pdf-mode");

  /* ---------------- exports ---------------- */
  async function exportPdf() {
    if (inPdfMode()) { toast("You're editing a PDF — use its Export button, or ← Studio to go back", "warn"); return; }
    await ensureFresh();
    toast("In the print dialog: destination “Save as PDF” · untick “Headers and footers”", null, 8000);
    setTimeout(() => { try { window.print(); } catch { toast("Printing is blocked here — open this file directly in Chrome/Edge", "warn"); } }, 350);
  }
  async function exportDocx() {
    if (inPdfMode()) { toast("You're editing a PDF — Word export needs the studio (← Studio)", "warn"); return; }
    await ensureFresh();
    if (!lastContentEl) return;
    const btn = $("#btnDocx");
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("busy");
    btn.innerHTML = `<span class="btnspin"></span> Exporting…`;
    try {
      const blob = await DocxExport.build(lastContentEl, state.settings, state.attachments);
      downloadBlob(blob, safeName() + ".docx");
      toast("Word file downloaded — click “Yes” if Word asks to update fields");
      // Honest warning only — read off the badge refreshLint already keeps
      // current, rather than paying a second full lint pass here.
      const badge = $("#lintBadge");
      const warns = badge.hidden ? 0 : parseInt(badge.textContent, 10) || 0;
      if (warns) toast(`${warns} document check${warns === 1 ? "" : "s"} outstanding — see the checks badge, bottom left`, "warn", 5000);
    } catch (e) {
      console.error("[DocForge] docx failed", e);
      toast("Word export failed — nothing was lost; try again", "warn");
    }
    btn.disabled = false;
    btn.classList.remove("busy");
    btn.innerHTML = label;
  }

  /* ---------------- command palette — the desk's spike ----------------
     Every action in the app, searchable by name. Built fresh on each open so
     the template list and theme label stay truthful; runs through the same
     overlay machinery as every dialog (focus trap, Esc, focus restore). */
  /* The definition lands at the end of the document — never at the caret,
     which would tear the sentence in two — and the caret stays on the marker. */
  function appendDef(def) {
    const at = editor.selectionStart;
    const src = editor.value.replace(/\s*$/, "");
    editor.value = (src ? src + "\n\n" : "") + def + "\n";
    editor.focus();
    editor.setSelectionRange(at, at);
    state.source = editor.value; markDirty(); scheduleRender();
  }
  function insertFootnote() {
    // next id = max existing id + 1 (counting would collide after a deletion,
    // and a duplicate id silently overwrites the other note's text on export)
    const ids = [...state.source.matchAll(/\[\^(\d+)\]/g)].map(m => +m[1]);
    const n = (ids.length ? Math.max(...ids) : 0) + 1;
    editor.focus();
    editor.setRangeText(`[^${n}]`, editor.selectionStart, editor.selectionEnd, "end");
    appendDef(`[^${n}]: Footnote text`);
  }
  function insertCitation() {
    editor.focus();
    editor.setRangeText("[@key]", editor.selectionStart, editor.selectionEnd, "end");
    appendDef("[@key]: Author, *Title of the source*, Publisher, Year.");
  }

  function cmdkCommands() {
    const cmds = [
      { g: "File", l: "New document", h: "", run: () => $("#btnNew").click() },
      { g: "File", l: "Open / import a file…", h: "", run: () => $("#projInput").click() },
      { g: "File", l: "Save project file", h: "Ctrl S", run: saveProject },
      { g: "File", l: "Rename document", h: "", run: () => $("#docTitle").click() },
      { g: "Export", l: "Export PDF", h: "Ctrl P", run: () => $("#btnPdf").click() },
      { g: "Export", l: "Export Word (.docx)", h: "", run: () => $("#btnDocx").click() },
      { g: "Export", l: "Export Markdown (.md)", h: "", run: exportMd },
      { g: "Insert", l: "Insert table", h: "", run: TOOL_ACTS.table },
      { g: "Insert", l: "Insert equation", h: "", run: () => insertBlock("$$\nE = mc^2\n$$") },
      { g: "Insert", l: "Insert figure (screenshot placeholder)", h: "", run: TOOL_ACTS.shot },
      { g: "Insert", l: "Insert image from file…", h: "", run: TOOL_ACTS.image },
      { g: "Insert", l: "Insert footnote", h: "", run: insertFootnote },
      { g: "Insert", l: "Insert citation", h: "", run: insertCitation },
      { g: "Insert", l: "Insert callout", h: "", run: TOOL_ACTS.callout },
      { g: "Insert", l: "Insert code block", h: "", run: TOOL_ACTS.codeblock },
      { g: "Insert", l: "Insert table of contents", h: "", run: TOOL_ACTS.toc },
      { g: "Insert", l: "Insert page break", h: "", run: TOOL_ACTS.pagebreak },
      { g: "View", l: "Find in document", h: "Ctrl F", run: () => findBar(true) },
      { g: "View", l: "Replace in document", h: "Ctrl H", run: () => { findBar(true); $("#replInput").focus(); } },
      { g: "View", l: "Toggle outline", h: "", run: () => $("#btnOutline").click() },
      { g: "View", l: "Toggle document settings", h: "", run: () => $("#btnSettings").click() },
      { g: "View", l: document.body.classList.contains("focus-mode") ? "Leave focus mode" : "Focus mode — just the manuscript", h: "Ctrl ⇧ Enter", run: toggleFocus },
      { g: "View", l: "Undo", h: "Ctrl Z", run: docUndo },
      { g: "View", l: "Redo", h: "Ctrl ⇧ Z", run: docRedo },
      { g: "View", l: document.documentElement.hasAttribute("data-light") ? "Switch to the night desk (dark)" : "Switch to the day desk (light)", h: "", run: () => $("#btnDark").click() },
      { g: "View", l: "Keyboard shortcuts", h: "Ctrl /", run: () => openOv($("#keysOverlay")) },
      { g: "View", l: "Help — writing & exporting", h: "", run: () => openOv($("#helpOverlay")) },
    ];
    for (const [id, t] of Object.entries(TEMPLATES)) {
      cmds.push({ g: "Templates", l: `Template: ${t.label}`, h: "", run: async () => {
        if (await confirmModal("Load template?", "“" + t.label + "” will replace the current document. Use Save first if you want a backup file.")) applyTemplate(id);
      } });
    }
    return cmds;
  }

  let ckSel = 0, ckItems = [];
  function cmdkRender(q) {
    const list = $("#cmdkList");
    const needle = q.trim().toLowerCase();
    const all = cmdkCommands();
    ckItems = !needle ? all : all
      .map(c => ({ c, i: c.l.toLowerCase().indexOf(needle) }))
      .filter(x => x.i >= 0 || x.c.g.toLowerCase().startsWith(needle))
      .sort((a, b) => (a.i < 0 ? 99 : a.i) - (b.i < 0 ? 99 : b.i))
      .map(x => x.c);
    ckSel = Math.min(ckSel, Math.max(0, ckItems.length - 1));
    if (!ckItems.length) {
      list.innerHTML = `<div class="ck-empty">No matching command</div>`;
      $("#cmdkInput").removeAttribute("aria-activedescendant");
      return;
    }
    let h = "", lastG = null;
    ckItems.forEach((c, i) => {
      // group lines are visual wayfinding only — a listbox may hold options alone
      if (c.g !== lastG) { h += `<div class="ck-group" aria-hidden="true">${c.g}</div>`; lastG = c.g; }
      h += `<button class="ck-item" role="option" id="ck-${i}" data-i="${i}" tabindex="-1" aria-selected="${i === ckSel}">` +
        `${Engine.esc(c.l)}${c.h ? `<span class="ck-hint">${c.h}</span>` : ""}</button>`;
    });
    list.innerHTML = h;
    const sel = list.querySelector(`[data-i="${ckSel}"]`);
    if (sel) sel.scrollIntoView({ block: "nearest" });
    $("#cmdkInput").setAttribute("aria-activedescendant", `ck-${ckSel}`);
    list.querySelectorAll(".ck-item").forEach(b => {
      b.onclick = () => cmdkRun(+b.dataset.i);
      b.onmousemove = () => { if (ckSel !== +b.dataset.i) { ckSel = +b.dataset.i; cmdkPaint(); } };
    });
  }
  function cmdkPaint() {
    $("#cmdkList").querySelectorAll(".ck-item").forEach(b => b.setAttribute("aria-selected", String(+b.dataset.i === ckSel)));
    const sel = $("#cmdkList").querySelector(`[data-i="${ckSel}"]`);
    if (sel) sel.scrollIntoView({ block: "nearest" });
    $("#cmdkInput").setAttribute("aria-activedescendant", `ck-${ckSel}`);
  }
  function cmdkRun(i) {
    const cmd = ckItems[i];
    if (!cmd) return; // Enter on "no matching command" keeps the palette (and the query)
    closeOv($("#cmdkOverlay"));
    cmd.run();
  }
  function cmdkOpen() {
    if (inPdfMode()) return; // studio actions would hit the hidden document
    ckSel = 0;
    $("#cmdkInput").value = "";
    openOv($("#cmdkOverlay"));
    cmdkRender("");
  }
  function bindCmdk() {
    const input = $("#cmdkInput");
    input.addEventListener("input", () => { ckSel = 0; cmdkRender(input.value); });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); cmdkRun(ckSel); return; }
      if (!ckItems.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); ckSel = Math.min(ckSel + 1, ckItems.length - 1); cmdkPaint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ckSel = Math.max(ckSel - 1, 0); cmdkPaint(); }
      else if (e.key === "Home" && !input.value) { e.preventDefault(); ckSel = 0; cmdkPaint(); }
      else if (e.key === "End" && !input.value) { e.preventDefault(); ckSel = ckItems.length - 1; cmdkPaint(); }
    });
  }

  /* ---------------- outline navigator ---------------- */
  let outlineOpen = false, activeOlTab = "head";
  function refreshOutline() {
    if (!outlineOpen) return;
    const list = $("#olList");
    if (!list) return;

    if (activeOlTab === "head") {
      const heads = [...scaleWrap.querySelectorAll(".pagedjs_page .doc .content :is(h1,h2,h3)")];
      if (!heads.length) { list.innerHTML = `<div class="ol-empty">No headings yet</div>`; return; }
      list.innerHTML = heads.map((h, i) =>
        `<button class="ol-item l${h.tagName[1]}" data-i="${i}">${Engine.esc(h.textContent.trim())}</button>`).join("");
      list.querySelectorAll(".ol-item").forEach(b => b.onclick = () => {
        heads[+b.dataset.i]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else if (activeOlTab === "figtbl") {
      const items = [...scaleWrap.querySelectorAll(".pagedjs_page .doc .content :is(figure.shot, table[data-caption], [data-tbl])")];
      if (!items.length) { list.innerHTML = `<div class="ol-empty">No figures or tables</div>`; return; }
      list.innerHTML = items.map((el, i) => {
        const isFig = el.tagName === "FIGURE";
        const cap = el.dataset.caption || el.querySelector("figcaption")?.textContent || (isFig ? "Figure" : "Table");
        return `<button class="ol-item l1" data-i="${i}"><b>${isFig ? "Fig" : "Tbl"}:</b> ${Engine.esc(cap.trim())}</button>`;
      }).join("");
      list.querySelectorAll(".ol-item").forEach(b => b.onclick = () => {
        items[+b.dataset.i]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else if (activeOlTab === "notes") {
      const notes = [...scaleWrap.querySelectorAll(".pagedjs_page .doc .content .footnote, .pagedjs_page_content [data-note='footnote']")];
      if (!notes.length) { list.innerHTML = `<div class="ol-empty">No footnotes</div>`; return; }
      list.innerHTML = notes.map((n, i) => {
        const fn = n.dataset.fn || String(i + 1);
        const txt = n.textContent.trim().slice(0, 40);
        return `<button class="ol-item l1" data-i="${i}"><b>[^{${fn}}]:</b> ${Engine.esc(txt)}…</button>`;
      }).join("");
      list.querySelectorAll(".ol-item").forEach(b => b.onclick = () => {
        notes[+b.dataset.i]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  /* ---------------- find & replace ---------------- */
  const find = { open: false, at: -1 };
  function findBar(show) {
    find.open = show;
    $("#findBar").style.display = show ? "flex" : "none";
    if (show) { $("#findInput").focus(); $("#findInput").select(); findCount(); }
    else editor.focus();
  }
  function findCount() {
    const q = $("#findInput").value;
    if (!q) { $("#findCount").textContent = ""; return 0; }
    let n = 0, i = -1;
    const hay = editor.value.toLowerCase(), needle = q.toLowerCase();
    while ((i = hay.indexOf(needle, i + 1)) !== -1) n++;
    $("#findCount").textContent = n ? n + " found" : "none";
    return n;
  }
  function findStep(back) {
    const q = $("#findInput").value;
    if (!q) return;
    const hay = editor.value.toLowerCase(), needle = q.toLowerCase();
    let i;
    if (back) {
      i = hay.lastIndexOf(needle, Math.max(0, editor.selectionStart - 1));
      if (i === -1) i = hay.lastIndexOf(needle);
    } else {
      i = hay.indexOf(needle, editor.selectionEnd);
      if (i === -1) i = hay.indexOf(needle);
    }
    if (i === -1) return;
    editor.focus();
    editor.setSelectionRange(i, i + q.length);
  }
  function replaceOne() {
    const q = $("#findInput").value;
    if (!q) return;
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel.toLowerCase() === q.toLowerCase()) {
      editor.setRangeText($("#replInput").value, editor.selectionStart, editor.selectionEnd, "end");
      state.source = editor.value; markDirty(); scheduleRender();
    }
    findStep(false); findCount();
  }
  function replaceAll() {
    const q = $("#findInput").value;
    if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const next = editor.value.replace(re, $("#replInput").value);
    if (next === editor.value) return;
    const n = (editor.value.match(re) || []).length;
    /* execCommand("insertText") is the one edit path Chromium records in
       the textarea's native undo stack — setRangeText and .value do not */
    editor.focus();
    editor.setSelectionRange(0, editor.value.length);
    let undoable = false;
    try { undoable = document.execCommand(next ? "insertText" : "delete", false, next); } catch {}
    if (!undoable) editor.setRangeText(next, 0, editor.value.length, "end");
    state.source = editor.value; markDirty(); scheduleRender();
    toast(`Replaced ${n} occurrence${n === 1 ? "" : "s"}` + (undoable ? " — Ctrl+Z undoes" : ""));
    findCount();
  }

  /* ---------------- paste cleanup ----------------
     Word and web pages paste as HTML soup; convert the useful structure to the
     app's own markdown instead of dumping tags or losing everything. */
  function htmlToMd(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,meta,link,head title").forEach(n => n.remove());
    // A [screenshot] token is line-anchored and can never parse inside a table
    // cell — strip it there rather than printing the marker literally.
    const cell = t => t.replace(/\[screenshot:[^\]]*\]/gi, " ").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
    function inline(node) {
      let s = "";
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) { s += ch.textContent.replace(/\s+/g, " "); return; }
        if (ch.nodeType !== 1) return;
        const t = ch.tagName.toLowerCase(), inner = inline(ch);
        if (t === "br") s += "\n";
        else if ((t === "b" || t === "strong") && inner.trim()) s += `**${inner.trim()}**`;
        else if ((t === "i" || t === "em") && inner.trim()) s += `*${inner.trim()}*`;
        else if (t === "u" && inner.trim()) s += `++${inner.trim()}++`;
        else if ((t === "s" || t === "del" || t === "strike") && inner.trim()) s += `~~${inner.trim()}~~`;
        else if (t === "mark" && inner.trim()) {
          const hl = ch.getAttribute("data-hl");
          s += `==${hl && hl !== "yellow" ? `{${hl}}` : ""}${inner.trim()}==`;
        }
        else if (t === "span" && ch.classList.contains("dfspan") && inner.trim()) {
          // Rebuild the attribute span so colour/size/face survive a round trip.
          const d = ch.dataset, parts = [];
          if (d.color) parts.push("color=#" + d.color.toLowerCase());
          if (d.bg) parts.push("bg=#" + d.bg.toLowerCase());
          if (d.size) parts.push("size=" + d.size);
          if (d.font) parts.push(`font="${d.font}"`);
          if (d.u) parts.push("u");
          if (d.sc) parts.push("sc");
          if (d.caps) parts.push("caps");
          s += parts.length ? `[${inner.trim()}]{${parts.join(" ")}}` : inner;
        }
        // The sub/sup marks take no spaces; a multi-word script stays plain text.
        else if (t === "sub" && inner.trim() && !/\s/.test(inner.trim())) s += `~${inner.trim()}~`;
        else if (t === "sup" && inner.trim() && !/\s/.test(inner.trim())) s += `^${inner.trim()}^`;
        else if (t === "code" && inner.trim()) s += "`" + inner.trim() + "`";
        else if (t === "a" && ch.getAttribute("href") && /^https?:/i.test(ch.getAttribute("href")))
          s += `[${inner.trim() || ch.getAttribute("href")}](${ch.getAttribute("href")})`;
        else if (t === "img") {
          // On its own line so the [screenshot] token parses; imported keys attach the bytes.
          const key = ch.getAttribute("data-df-key");
          const alt = (ch.getAttribute("alt") || "").replace(/[|\[\]]/g, " ").replace(/\s+/g, " ").trim();
          if (key) s += `\n[screenshot: ${alt || "Imported image"} | img:${key}]\n`;
          else if (alt) s += `\n[screenshot: ${alt}]\n`;
        }
        else s += inner;
      });
      return s;
    }
    function block(node, depth = 0) {
      let out = "";
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) { const t = ch.textContent.trim(); if (t) out += t + "\n\n"; return; }
        if (ch.nodeType !== 1) return;
        const t = ch.tagName.toLowerCase();
        if (/^h[1-6]$/.test(t)) out += "#".repeat(Math.min(+t[1], 4)) + " " + inline(ch).trim() + "\n\n";
        else if (t === "p" || t === "div" || t === "section" || t === "article") {
          const kids = ch.querySelector("p,ul,ol,table,h1,h2,h3,h4,pre,blockquote,div");
          if (kids && t !== "p") out += block(ch, depth);
          else { const s = inline(ch).trim(); if (s) out += s + "\n\n"; }
        }
        else if (t === "ul" || t === "ol") {
          [...ch.children].forEach((li, i) => {
            if (li.tagName.toLowerCase() !== "li") return;
            const mark = t === "ol" ? `${i + 1}. ` : "- ";
            const sub = li.querySelector("ul,ol");
            const own = inline(li).trim();
            out += "  ".repeat(depth) + mark + own + "\n";
            if (sub) out += block(li, depth + 1).replace(/^(?!\s*$)/gm, "");
          });
          if (!depth) out += "\n";
        }
        else if (t === "table") {
          const rows = [...ch.querySelectorAll("tr")].map(tr =>
            [...tr.children].map(td => cell(inline(td))));
          if (rows.length) {
            out += "| " + rows[0].join(" | ") + " |\n";
            out += "| " + rows[0].map(() => "---").join(" | ") + " |\n";
            rows.slice(1).forEach(r => { out += "| " + r.join(" | ") + " |\n"; });
            out += "\n";
          }
        }
        else if (t === "pre") out += "```\n" + ch.textContent.replace(/\n$/, "") + "\n```\n\n";
        else if (t === "blockquote") out += block(ch, depth).trim().replace(/^/gm, "> ") + "\n\n";
        else if (t === "img") {
          const key = ch.getAttribute("data-df-key");
          const alt = (ch.getAttribute("alt") || "").replace(/[|\[\]]/g, " ").replace(/\s+/g, " ").trim();
          if (key) out += `[screenshot: ${alt || "Imported image"} | img:${key}]\n\n`;
          else if (alt) out += `[screenshot: ${alt}]\n\n`;
        }
        else out += block(ch, depth);
      });
      return out;
    }
    return block(doc.body).replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();
  }

  /* The plain-text half of smart paste, the same two rules the studio applies
     (apps/web/lib/smart-paste.ts, where they are unit-tested) — kept in step
     by hand, exactly as htmlToMd above is. */
  const pasteCell = s => s.trim().replace(/\|/g, "\\|");
  function tableFromTsv(text) {
    const raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
    if (!raw.includes("\t")) return null;
    const lines = raw.replace(/\n+$/, "").split("\n");
    if (lines.length < 2 || lines.length > 200) return null;
    const rows = lines.map(l => l.split("\t"));
    const width = rows[0].length;
    if (width < 2 || width > 20) return null;
    if (!rows.every(r => r.length === width)) return null;
    if (rows.some(r => r.some(c => c.length > 200))) return null;
    const head = rows[0].map(pasteCell);
    return [
      "| " + head.join(" | ") + " |",
      "| " + head.map(() => "---").join(" | ") + " |",
      ...rows.slice(1).map(r => "| " + r.map(pasteCell).join(" | ") + " |"),
      "",
    ].join("\n");
  }
  const URL_ONLY = /^(?:https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)$/i;
  function linkAround(pasted, selected) {
    const url = String(pasted == null ? "" : pasted).trim();
    const text = String(selected == null ? "" : selected).trim();
    if (!url || !text) return null;
    if (!URL_ONLY.test(url)) return null;
    if (URL_ONLY.test(text)) return null;      // never throw away the reader's own URL
    if (/\n/.test(selected)) return null;      // a selection across blocks is not a label
    return "[" + text.replace(/[[\]]/g, "\\$&") + "](" + url + ")";
  }

  /* ---------------- structure linter ----------------
     Gentle warnings for the shapes that break exports; never blocks anything. */
  function lintSource(src) {
    const warns = [];
    const lines = src.split("\n");
    let fence = null, coDepth = 0, coLine = 0;
    lines.forEach((line, i) => {
      const n = i + 1;
      const fm = line.match(/^(```+|~~~+)/);
      if (fence) { if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null; return; }
      if (fm) { fence = fm[1]; return; }
      if (/^:::(note|tip|warning|important|center|right|left|justify|banner)\b/i.test(line)) { coDepth++; coLine = n; }
      else if (/^:::\s*$/.test(line)) coDepth = Math.max(0, coDepth - 1);
      if (/^#{5,}\s/.test(line)) warns.push([n, "Heading level 5+ — styled plainly and never listed in the contents. Consider #### or bold text."]);
      if (/^\s*<(?!\/?(b|i|em|strong|code|br)\b)[a-z][^>]*>/i.test(line)) warns.push([n, "Raw HTML — it will be ignored or printed as text. Use the toolbar marks instead."]);
      const t = line.match(/^\s*\|(.+)\|\s*$/);
      if (t && i && /^\s*\|.+\|\s*$/.test(lines[i - 1] || "")) {
        const cols = r => (r.match(/(?<!\\)\|/g) || []).length;
        if (cols(line) !== cols(lines[i - 1])) warns.push([n, "Table row has a different number of cells than the row above — the table will come out ragged."]);
      }
    });
    if (fence) warns.push([lines.length, "Unclosed code fence ``` — everything after it is being treated as code."]);
    if (coDepth > 0) warns.push([coLine, "Unclosed callout ::: — it swallows the rest of the document."]);
    // Undefined footnotes / citations / cross-references
    const defs = new Set(), cites = new Set(), ids = new Set();
    src.replace(/^\[\^([^\]\s]+)\]:/gm, (m, id) => defs.add(id));
    src.replace(/^\[@([^\]\s,]+)\]:/gm, (m, id) => cites.add(id));
    src.replace(/\{#([\w:.-]+)\}/g, (m, id) => ids.add(id));
    src.replace(/#([A-Za-z][\w:.-]*)/g, (m, id) => ids.add(id)); // figure/table ids declared inline
    /* A call shown as a specimen is not a call: skip fenced blocks by tracking the
       fence, and blank out inline code spans (keeping the line length, so any later
       column arithmetic still holds) before looking for calls in the prose. */
    let scanFence = null;
    lines.forEach((line, i) => {
      const fm = line.match(/^(```+|~~~+)/);
      if (scanFence) { if (fm && fm[1][0] === scanFence[0] && fm[1].length >= scanFence.length) scanFence = null; return; }
      if (fm) { scanFence = fm[1]; return; }
      const scan = line.replace(/`+[^`]*`+/g, m => " ".repeat(m.length));
      scan.replace(/\[\^([^\]\s]+)\](?!:)/g, (m, id) => { if (!defs.has(id)) warns.push([i + 1, `Footnote [^${id}] has no definition line ([^${id}]: …).`]); });
      scan.replace(/\[@([^\]\s,]+)(?:,[^\]]*)?\](?!:)/g, (m, id) => { if (!cites.has(id)) warns.push([i + 1, `Citation [@${id}] has no entry ([@${id}]: …).`]); });
      // A face this machine lacks prints correctly from Word and falls back everywhere else.
      scan.replace(/\bfont=(?:"([^"]+)"|([^\s"\]}]+))/g, (m, quoted, bare) => {
        const fam = quoted || bare;
        if (!fontInstalled(fam)) warns.push([i + 1, `${fam} is not installed on this device — the preview and the printed PDF fall back to a lookalike. The Word file still names ${fam}, so it prints correctly wherever the font exists.`]);
      });
    });
    return warns;
  }
  function refreshLint() {
    const warns = lintSource(state.source);
    /* The document-wide faces live in settings, not in the source, so they are checked
       here rather than in lintSource — same failure, same wording. */
    for (const k of ["fontHead", "fontBody"]) {
      const v = state.settings[k];
      if (typeof v !== "string" || !v.startsWith("sys:")) continue;
      const fam = v.slice(4);
      if (!fontInstalled(fam)) warns.push([1, `${fam} (${k === "fontHead" ? "heading" : "body"} typeface) is not installed on this device — the preview and the printed PDF fall back to a lookalike. The Word file still names ${fam}, so it prints correctly wherever the font exists.`]);
    }
    const badge = $("#lintBadge"), panel = $("#lintPanel");
    badge.hidden = !warns.length;
    badge.textContent = warns.length === 1 ? "1 warning" : warns.length + " warnings";
    if (!warns.length) { panel.hidden = true; return; }
    panel.innerHTML = warns.slice(0, 40).map(([line, msg]) =>
      `<button class="lint-item" data-line="${line}"><span class="ln">line ${line}</span>${Engine.esc(msg)}</button>`).join("");
    panel.querySelectorAll(".lint-item").forEach(b => b.onclick = () => {
      const ln = +b.dataset.line;
      const pos = state.source.split("\n").slice(0, ln - 1).join("\n").length + (ln > 1 ? 1 : 0);
      editor.focus();
      editor.setSelectionRange(pos, pos);
      const lineHeight = 21;
      editor.scrollTop = Math.max(0, (ln - 6) * lineHeight);
    });
  }

  /* ---------------- focus mode — just the manuscript ---------------- */
  function toggleFocus() {
    document.body.classList.toggle("focus-mode");
    const isFocus = document.body.classList.contains("focus-mode");
    const btn = $("#btnFocusExit");
    if (btn) btn.hidden = !isFocus;
    applyZoom();
    updatePageIndicator();
  }

  /* ---------------- pane divider ---------------- */
  function bindDivider() {
    const div = $("#paneDivider"), ep = $("#editorPane"), main = $("#main");
    const saved = parseFloat(safeLS.get("docforge.split"));
    if (saved >= 22 && saved <= 65) ep.style.flex = `0 0 ${saved}%`;
    let raf = 0, pct = null;
    div.addEventListener("pointerdown", e => {
      e.preventDefault();
      div.setPointerCapture(e.pointerId);
      div.classList.add("dragging");
      const move = ev => {
        const r = main.getBoundingClientRect();
        pct = Math.max(22, Math.min(65, ((ev.clientX - r.left) / r.width) * 100));
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          ep.style.flex = `0 0 ${pct}%`;
          if (zoomMode === "fit") applyZoom();
        });
      };
      const up = () => {
        div.classList.remove("dragging");
        div.removeEventListener("pointermove", move);
        if (pct != null) safeLS.set("docforge.split", pct.toFixed(1));
        applyZoom(); updatePageIndicator();
      };
      div.addEventListener("pointermove", move);
      div.addEventListener("pointerup", up, { once: true });
    });
  }

  /* ---------------- chrome theme ----------------
     The chrome ships dark; this offers a light variant. App surfaces only — the
     document pages stay paper-white in either. */
  const UI_KEY = "docforge.ui";
  function applyUiTheme(light) {
    document.documentElement.toggleAttribute("data-light", !!light);
    safeLS.set(UI_KEY, light ? "light" : "dark");
    /* Paint workaround, not a mechanics change: Chromium sometimes leaves the
       composited chrome bars (promoted by z-index + shadow) rendered with the
       previous theme's custom-property values after the attribute flip — the
       background survives as a stale solid-colour quad that even a resize
       won't re-raster. Briefly toggling layer promotion forces a fresh raster
       with the new values; visually a no-op. */
    const els = [document.body, ...document.querySelectorAll("#topbar,#toolbar,#findBar,#settings,#editorPane,#embedHint,#peBar")];
    for (const el of els) el.style.transform = "translateZ(0)";
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const el of els) el.style.transform = ""; }));
  }

  function bindChrome() {
    /* one door for the drawer, so aria-expanded can never drift from the truth */
    const setDrawer = open => {
      $("#settings").classList.toggle("open", open);
      $("#btnSettings").setAttribute("aria-expanded", String(open));
    };
    $("#btnSettings").onclick = () => setDrawer(!$("#settings").classList.contains("open"));
    $("#btnHelp").onclick = () => openOv($("#helpOverlay"));
    $$("[data-close]").forEach(b => b.onclick = () => closeOv(b.closest(".overlay")));
    $("#btnSaveProj").onclick = saveProject;
    $("#btnSaveMd").onclick = exportMd;
    $("#btnOpen").onclick = () => $("#projInput").click();
    $("#btnNew").onclick = async () => { if (await confirmModal("Start a new document?", "The editor will be replaced with a blank document. Your current work stays in autosave until you type again — use Save first if you want a backup file.")) applyTemplate("blank"); };
    $("#btnPdf").onclick = exportPdf;
    $("#btnDocx").onclick = exportDocx;
    /* Templates: a designed menu, not a native select in a trenchcoat. */
    const tplMenu = $("#tplMenu");
    const tplBtn = $("#templateSelect");
    const closeTpl = () => { tplMenu.style.display = "none"; tplBtn.setAttribute("aria-expanded", "false"); };
    tplBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (tplMenu.style.display === "block") return closeTpl();
      const r = tplBtn.getBoundingClientRect();
      tplMenu.style.display = "block";
      tplMenu.style.left = Math.min(r.left, innerWidth - tplMenu.offsetWidth - 8) + "px";
      tplMenu.style.top = (r.bottom + 6) + "px";
      tplBtn.setAttribute("aria-expanded", "true");
      const first = tplMenu.querySelector(".tpl-item");
      if (first) first.focus();
    });
    tplMenu.addEventListener("click", async e => {
      const item = e.target.closest(".tpl-item");
      if (!item) return;
      closeTpl();
      const id = item.dataset.id;
      if (await confirmModal("Load template?", "“" + TEMPLATES[id].label + "” will replace the current document. Use Save first if you want a backup file.")) applyTemplate(id);
    });
    /* menu semantics: arrows walk the list, Home/End jump, Tab leaves and
       closes (a menu must not stay stranded over the chrome), Esc is global */
    tplMenu.addEventListener("keydown", e => {
      if (e.key === "Tab") { closeTpl(); return; }
      const items = [...tplMenu.querySelectorAll(".tpl-item")];
      const at = items.indexOf(document.activeElement);
      let to = -1;
      if (e.key === "ArrowDown") to = (at + 1) % items.length;
      else if (e.key === "ArrowUp") to = (at - 1 + items.length) % items.length;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = items.length - 1;
      if (to >= 0) { e.preventDefault(); items[to].focus(); }
    });
    document.addEventListener("click", e => {
      if (!e.target.closest("#tplMenu") && !e.target.closest("#templateSelect")) closeTpl();
    });

    /* the masthead title opens the document's own settings */
    $("#docTitle").onclick = () => {
      setDrawer(true);
      $("#sTitle").focus();
      $("#sTitle").select();
    };
    $$("#toolbar .tb[data-act]").forEach(b => b.addEventListener("click", () => TOOL_ACTS[b.dataset.act]?.()));

    /* toolbar rows scroll instead of wrapping; a fade on the clipped edge
       says "more plates this way" (drawer open/close changes the width,
       so a ResizeObserver keeps the cue honest) */
    $$(".tbrow").forEach(row => {
      const upd = () => {
        row.classList.toggle("scroll-l", row.scrollLeft > 4);
        row.classList.toggle("scroll-r", row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
      };
      row.addEventListener("scroll", upd, { passive: true });
      new ResizeObserver(upd).observe(row);
      upd();
      requestAnimationFrame(upd); /* fonts/layout can shift widths after boot */
    });
    $("#btnFocusExit").onclick = toggleFocus;
    $("#zoomIn").onclick = () => { zoomMode = "man"; zoomVal = Math.min(2, (zoomVal || 1) + 0.1); applyZoom(); };
    $("#zoomOut").onclick = () => { zoomMode = "man"; zoomVal = Math.max(0.25, (zoomVal || 1) - 0.1); applyZoom(); };
    $("#zoomFit").onclick = () => { zoomMode = "fit"; applyZoom(); };

    editor.addEventListener("input", () => { state.source = editor.value; markDirty(); scheduleRender(); });

    /* outline */
    $$("#outlinePanel .ol-tab").forEach(tab => {
      tab.onclick = () => {
        $$("#outlinePanel .ol-tab").forEach(t => t.classList.remove("on"));
        tab.classList.add("on");
        activeOlTab = tab.dataset.tab;
        refreshOutline();
      };
    });
    $("#btnOutline").onclick = () => {
      outlineOpen = !outlineOpen;
      $("#outlinePanel").hidden = !outlineOpen;
      $("#btnOutline").classList.toggle("on", outlineOpen);
      $("#btnOutline").setAttribute("aria-expanded", String(outlineOpen));
      refreshOutline();
    };

    /* find & replace */
    $("#findClose").onclick = () => findBar(false);
    $("#findNext").onclick = () => { findStep(false); };
    $("#findPrev").onclick = () => { findStep(true); };
    $("#replOne").onclick = replaceOne;
    $("#replAll").onclick = replaceAll;
    $("#findInput").addEventListener("input", findCount);
    $("#findInput").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); findStep(e.shiftKey); }
      if (e.key === "Escape") findBar(false);
    });
    $("#replInput").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); replaceOne(); }
      if (e.key === "Escape") findBar(false);
    });

    /* structure linter */
    $("#lintBadge").onclick = () => { $("#lintPanel").hidden = !$("#lintPanel").hidden; };

    /* dark chrome */
    $("#btnDark").onclick = () => applyUiTheme(!document.documentElement.hasAttribute("data-light"));

    /* paste cleanup — four readings of one clipboard (§8.1), in the order that
       leaves the fewest surprises: a URL over a selection links it, rich HTML
       becomes Markdown, a tab-separated range becomes a table, and anything
       else lands exactly as it came. */
    editor.addEventListener("paste", e => {
      const cd = e.clipboardData;
      if (!cd) return;
      const raw = cd.getData("text/plain") || "";
      const s0 = editor.selectionStart, s1 = editor.selectionEnd;
      /* One undo returns what was COPIED, not an empty line: the clipboard's
         own text is written first and closed as its own history entry
         (hist.t = 0 breaks recordSource's 900 ms coalescing window), then the
         reading of it replaces that text. The toast has always promised this;
         until now it wasn't true. */
      const apply = (md, said) => {
        e.preventDefault();
        if (raw) {
          editor.setRangeText(raw, s0, s1, "end");
          state.source = editor.value;
          markDirty();
          hist.t = 0;
          editor.setRangeText(md, s0, s0 + raw.length, "end");
        } else {
          editor.setRangeText(md, s0, s1, "end");
        }
        state.source = editor.value;
        markDirty();
        scheduleRender();
        toast(said);
      };

      const linked = linkAround(raw, editor.value.slice(s0, s1));
      if (linked) return apply(linked, "Linked the selection — Ctrl+Z restores it");

      const html = cd.getData("text/html");
      if (html && /<(h[1-6]|p|li|table|b|strong|em|i|a)\b/i.test(html)) {
        const md = htmlToMd(html);
        if (md) return apply(md, "Pasted as Markdown — Ctrl+Z restores the raw text");
      }

      const table = tableFromTsv(raw);
      if (table) return apply(table, "Pasted as a table — Ctrl+Z restores the raw text");
      // plain text pastes untouched
    });
    editor.addEventListener("keydown", e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); TOOL_ACTS.bold(); }
      if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); TOOL_ACTS.italic(); }
      if (mod && e.key.toLowerCase() === "u") { e.preventDefault(); TOOL_ACTS.underline(); }
      if (e.key === "Tab") { e.preventDefault(); replaceRange(editor.selectionStart, editor.selectionEnd, "  "); }
    });
    document.addEventListener("keydown", e => {
      const mod = e.ctrlKey || e.metaKey;
      /* one document history for both panes — but chrome fields keep their own */
      const inDocument = e.target === editor || (e.target.closest && e.target.closest("#scaleWrap"));
      if (mod && !e.altKey && e.key.toLowerCase() === "z" && inDocument) {
        e.preventDefault();
        e.shiftKey ? docRedo() : docUndo();
        return;
      }
      if (mod && !e.altKey && e.key.toLowerCase() === "y" && inDocument) { e.preventDefault(); docRedo(); return; }
      if (mod && e.shiftKey && e.key === "Enter") { e.preventDefault(); toggleFocus(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveProject(); }
      if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); exportPdf(); }
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const ov = $("#cmdkOverlay");
        if (ov.classList.contains("open")) closeOv(ov);
        // never open beneath (or over) another dialog — overlays share a z-plane
        else if (!document.querySelector(".overlay.open")) cmdkOpen();
      }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); findBar(true); }
      if (mod && e.key.toLowerCase() === "h") { e.preventDefault(); findBar(true); $("#replInput").focus(); }
      if (mod && e.key === "/") {
        e.preventDefault();
        const ov = $("#keysOverlay");
        ov.classList.contains("open") ? closeOv(ov) : openOv(ov);
      }
      if (e.key === "Escape") {
        const openOv = document.querySelector(".overlay.open");
        if (openOv) {
          $$(".overlay.open").forEach(o => o.__cancel ? o.__cancel() : closeOv(o));
        } else if (document.body.classList.contains("focus-mode")) {
          toggleFocus();
        } else if (tplMenu.style.display === "block") {
          closeTpl(); tplBtn.focus();
        }
      }
    });
    window.addEventListener("resize", () => { if (zoomMode === "fit") applyZoom(); });

    /* Ctrl+wheel zooms the preview; clicking the percentage snaps back to fit */
    $("#previewScroll").addEventListener("wheel", e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomMode = "man";
      zoomVal = Math.min(2, Math.max(0.25, (zoomVal || 1) + (e.deltaY < 0 ? 0.1 : -0.1)));
      applyZoom();
    }, { passive: false });
    $("#zoomPct").style.cursor = "pointer";
    $("#zoomPct").title = "Reset to fit";
    $("#zoomPct").onclick = () => { zoomMode = "fit"; applyZoom(); };

    /* Drop an image file anywhere on the editor to insert it as a figure;
       a document file (.docx / .pdf / .md / project) routes through import. */
    /* While a file is held over the editor, an ink-ruled landing zone names
       what dropping will do. Counted enter/leave so child churn can't flicker it. */
    let dragDepth = 0;
    const dropHint = $("#dropHint");
    const dragHas = e => [...(e.dataTransfer?.types || [])].includes("Files");
    editor.addEventListener("dragenter", e => {
      if (!dragHas(e)) return;
      dragDepth++;
      dropHint.hidden = false;
    });
    editor.addEventListener("dragleave", () => {
      if (--dragDepth <= 0) { dragDepth = 0; dropHint.hidden = true; }
    });
    editor.addEventListener("dragover", e => { e.preventDefault(); });
    editor.addEventListener("drop", async e => {
      dragDepth = 0;
      dropHint.hidden = true;
      const docFile = [...(e.dataTransfer?.files || [])].find(f => /\.(docx|doc|pdf|md|markdown|txt|json|html|htm|csv|tsv|xlsx|pptx|epub|ipynb)$/i.test(f.name));
      if (docFile) { e.preventDefault(); importFile(docFile); return; }
      const file = [...(e.dataTransfer?.files || [])].find(f => /^image\//.test(f.type));
      if (!file) return; // let plain text drops behave natively
      e.preventDefault();
      try {
        const att = await processImageFile(file);
        const key = newKey();
        state.attachments[key] = att;
        const cap = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
        insertBlock(`[screenshot: ${cap} | img:${key}]`);
        toast("Image added as a figure");
      } catch { toast("Could not read that image", "warn"); }
    });
    window.addEventListener("beforeprint", () => {
      preprintZoom = scaleWrap.style.zoom; scaleWrap.style.zoom = ""; scaleWrap.style.transform = "";
      // Chrome names the saved PDF after the page title, so offer the document's own name.
      appTitle = document.title;
      document.title = safeName();
    });
    window.addEventListener("afterprint", () => {
      if (appTitle) { document.title = appTitle; appTitle = null; }
      if (preprintZoom != null) scaleWrap.style.zoom = preprintZoom; applyZoom();
    });
  }

  function boot() {
    // populate the templates menu (labels + one-line descriptions from TEMPLATES)
    $("#tplMenu").innerHTML = Object.entries(TEMPLATES).map(([id, t]) =>
      `<button class="tpl-item" role="menuitem" data-id="${id}"><b>${Engine.esc(t.label)}</b><span>${Engine.esc(t.desc || "")}</span></button>`
    ).join("");
    buildFontSelects();
    bindChrome(); bindSettings(); bindImageInput(); bindShotClicks(); bindProjectInput(); bindColorMenus(); bindPdfEditor(); bindCmdk(); bindFloatingToolbar();
    bindDivider();
    LiveEdit.attach({
      scaleWrap,
      scroller: $("#previewScroll"),
      getSource: () => state.source,
      setSource(src) { state.source = src; editor.value = src; markDirty(); scheduleLiveRender(); },
      scheduleRender: scheduleLiveRender,
      revert() { toast("That part of the manuscript is generated — edit it from the source panel", "warn"); doRender(); },
      editPending: scheduleLiveRender,
      undo: docUndo,
      redo: docRedo,
      toast,
    });
    // the source pane must never act on a source the manuscript hasn't written yet
    editor.addEventListener("focus", () => LiveEdit.flush());
    {
      let raf = 0;
      $("#previewScroll").addEventListener("scroll", () => {
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; updatePageIndicator(); });
      }, { passive: true });
    }

    const saved = safeLS.get(LS_KEY);
    let restored = false;
    if (saved) {
      try {
        const d = JSON.parse(saved);
        state.settings = normalizeSettings(d.settings);
        state.source = d.source || "";
        state.attachments = d.attachments || {};
        state.accentTouched = !!d.accentTouched;
        restored = true;
      } catch {}
    }
    if (!restored) {
      state.settings = { ...DEFAULTS, ...TEMPLATES.welcome.patch };
      state.source = TEMPLATES.welcome.source;
    }
    editor.value = state.source;
    hist.stack = [state.source]; hist.idx = 0;   // history baseline
    // Icon-only controls speak their tooltip to assistive tech too.
    $$("button[title]:not([aria-label])").forEach(b => {
      if (!b.textContent.trim()) b.setAttribute("aria-label", b.title);
    });
    applyUiTheme(safeLS.get(UI_KEY) !== "dark"); /* the day desk is the default */
    syncSettingsUI(); updateCounts(); refreshLint();
    if (window.self !== window.top) $("#embedHint").classList.add("on");
    doRender();
    /* First visit: open the manual once, after the desk has settled.
       Never again after that, and never inside an embedded preview. */
    if (window.self === window.top && !safeLS.get("docforge.helped")) {
      safeLS.set("docforge.helped", "1");
      setTimeout(() => openOv($("#helpOverlay")), 700);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
