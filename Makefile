PNPM ?= pnpm
NODE ?= node

# Installation is an explicit setup step: corepack pnpm install --frozen-lockfile.
# No test target installs packages or downloads a browser. Chromium must already
# be installed (or selected with PW_CHROMIUM), as it is in the Docker image.
export COREPACK_ENABLE_NETWORK := 0
export NEXT_TELEMETRY_DISABLED := 1
export TURBO_TELEMETRY_DISABLED := 1
export PNPM_DISABLE_SELF_UPDATE_CHECK := true

.PHONY: test test-unit test-coverage test-offline test-classic build build-classic build-web budgets start

# Portable offline gate. The complete classic UI lane is test-classic;
# real Word interop is separate: node qa/borders.mjs --word on Windows/Office.
test: test-unit test-coverage test-offline

test-unit:
	RUN_PARITY=1 $(PNPM) test

test-coverage:
	RUN_PARITY=1 $(PNPM) --filter @docforge/engine exec vitest run --coverage

test-offline: build-classic
	$(NODE) qa/offline-gate.mjs

test-classic: build-classic
	$(NODE) qa/classic-checks.mjs

build:
	$(PNPM) build

build-classic:
	$(NODE) build.mjs

build-web:
	$(PNPM) --filter @docforge/web build

budgets: build-classic build-web
	$(NODE) qa/budgets.mjs

start:
	$(PNPM) --filter @docforge/web start --hostname 0.0.0.0
