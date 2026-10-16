# Build: docker build -t docforge .
# Run:   docker run --rm -p 3000:3000 docforge
# Test:  docker run --rm --network none --entrypoint make docforge test
FROM node:24.11.1-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium fonts-liberation make \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    PNPM_DISABLE_SELF_UPDATE_CHECK=true \
    COREPACK_HOME=/opt/corepack \
    PW_CHROMIUM=/usr/bin/chromium

WORKDIR /app
COPY . .
# packageManager pins pnpm, including its integrity hash; never resolve "latest".
RUN corepack enable \
    && corepack prepare "$(node -p 'require("./package.json").packageManager')" --activate \
    && corepack pnpm install --frozen-lockfile

# Keep installed dev tools so the same image can run the offline QA command.
ENV COREPACK_ENABLE_NETWORK=0
RUN corepack pnpm build && chown -R node:node /app

ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "0.0.0.0"]
