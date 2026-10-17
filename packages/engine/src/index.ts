/// <reference path="./ambient.d.ts" />
/* ============================================================
   @docforge/engine — the markdown → document DOM pipeline, ported
   1:1 from src/js/engine.js (Phase 1, mechanical port).

   The public surface is EXACTLY the classic `Engine` global:
   the 17 members of the IIFE's return object, same names, same
   order. The single-file shell keeps its global via ./global.ts.

   Top-level side effects: only parse.ts touches anything at import
   time (the two marked.use calls, gfm before extensions — the same
   relative order the IIFE ran them in).
   ============================================================ */

import { HL_COLORS, RE_SHOT } from "./parse";
import { sanitizeRawHtml } from "./sanitize";
import { fmtDate, render } from "./render";
import {
  CUT_FILE,
  dynamicCss,
  EMBEDDED,
  FACES,
  FONTS,
  faceName,
  fontFaceCss,
  headContent,
  headParts,
  imageMetrics,
  MARGINS,
  PAGES,
  pageSpec,
  registerUserFace,
  sysStack,
  tints,
  unregisterUserFaces,
  WORD_CATALOG,
  watermarkMetrics,
} from "./themes";
import { esc } from "./util";

/** Exactly today's public surface — the classic `Engine` global, key order preserved. */
export const api = {
  render,
  dynamicCss,
  fontFaceCss,
  tints,
  PAGES,
  MARGINS,
  FONTS,
  FACES,
  EMBEDDED,
  CUT_FILE,
  fmtDate,
  esc,
  RE_SHOT,
  WORD_CATALOG,
  HL_COLORS,
  sysStack,
  faceName,
};

/* NOT part of `api`: that object is the classic Engine global, member for
   member in the classic order, and the parity gate holds it there. The
   reader-supplied-typeface registry (§8.2) is a named export the studio
   imports directly — additive, and invisible to anything that never calls it.

   `globalApi` is what every EDITION assigns to `globalThis.Engine`: the
   classic surface plus the additions consumers reach through the global
   (the .docx exporter needs headParts to mirror the running head). `api`
   stays exactly as it was, so the parity claim about its members holds. */
export const globalApi = {
  ...api,
  headParts,
  headContent,
  imageMetrics,
  pageSpec,
  watermarkMetrics,
  registerUserFace,
  unregisterUserFaces,
};

export type { HeadPart, UserFace, WatermarkMetrics } from "./themes";
export type {
  Attachment,
  Attachments,
  DfMarkToken,
  DfSpanToken,
  DfSubToken,
  DfSupToken,
  DfUnderToken,
  DialectToken,
  HlColorName,
  LineSpan,
  MarginSpec,
  MarkedToken,
  PageSpec,
  PreprocessInherited,
  RenderMeta,
  RenderResult,
  Settings,
  SpanAttrs,
  Tints,
} from "./types";
export {
  CUT_FILE,
  sanitizeRawHtml,
  dynamicCss,
  EMBEDDED,
  esc,
  FACES,
  FONTS,
  faceName,
  fmtDate,
  fontFaceCss,
  HL_COLORS,
  headContent,
  headParts,
  imageMetrics,
  MARGINS,
  PAGES,
  RE_SHOT,
  registerUserFace,
  render,
  sysStack,
  tints,
  unregisterUserFaces,
  WORD_CATALOG,
  watermarkMetrics,
};
