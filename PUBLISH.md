# Publishing and deploying DocForge

This repository is already the `rakshit-737/docforge` Git repository. Do not
run an old bootstrap script, re-initialize Git, or add `publish.sh`/`publish.bat`:
those files are intentionally absent and ignored because publishing is handled
by the checked-in workflows.

## Local release checks

Use Node 24 from `.nvmrc` and the pinned pnpm version from `package.json`:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

For the hosted studio, build it first and run its production checks with a
Chromium executable available to Playwright:

```bash
corepack pnpm --filter @docforge/web build
PW_CHROMIUM=/usr/bin/google-chrome corepack pnpm web:e2e
PW_CHROMIUM=/usr/bin/google-chrome corepack pnpm web:parity
```

## GitHub Pages deployment

`.github/workflows/pages.yml` builds and publishes the two single-file editions:

- current `dist/DocForge.html` at the Pages site root;
- the frozen `v1-classic` build at `/classic`.

Push to `main` to run the workflow, or use **Actions → Deploy DocForge → Run
workflow**. The workflow builds from source, so `dist/` does not need to be
committed. Pages does **not** deploy the Next.js studio; the hosted studio is a
separate deployment at `https://docforge-io.vercel.app/studio`.

## Versioned releases

Push a dotted version tag such as `v2.0.0` to run `release.yml`:

```bash
git tag v2.0.0
git push origin v2.0.0
```

The workflow builds `dist/DocForge.html`, attaches it and its SHA-256 checksum
to a GitHub Release, and publishes `@docforge/engine` and
`@docforge/mathml-omml` only when the repository has an `NPM_TOKEN` secret.

## Hosted web deployment

The Next app lives in `apps/web` and can be deployed by the existing Vercel
project. Its production build command is:

```bash
corepack pnpm --filter @docforge/web build
```

The app is local-first: document content, imports, versions, and exports stay
in the browser. A deployment must preserve the CSP and the web E2E security,
offline, accessibility, and parity gates; do not add remote asset or telemetry
requirements to the local document path.
