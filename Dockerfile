# Multi-stage Dockerfile for Cloud Run deployment.
#
# Layout:
#   1. `deps`   — install pnpm deps with frozen lockfile, cached as long as
#                 package.json + pnpm-lock.yaml are unchanged.
#   2. `builder` — copy source, regenerate API types from the committed
#                  OpenAPI snapshot (CI invariant: the snapshot is the
#                  contract), run `next build` with NEXT_PUBLIC_API_URL
#                  baked in. Produces `.next/standalone/`.
#   3. `runner` — alpine + Node, copies *only* the standalone bundle and
#                 the static assets. Final image is ~180 MB.
#
# `NEXT_PUBLIC_*` vars are inlined into the JS bundle at build time, so
# they MUST be passed as build-args (not runtime env). For Stadera's
# single-env setup that's a feature, not a limitation.

ARG NODE_VERSION=22-alpine

# ---- deps -------------------------------------------------------------
# `libc6-compat` is a common addition for packages that ship glibc-only
# native bindings (e.g. sharp). We don't have any — radix-ui, recharts,
# react are pure JS. Skipping it keeps the image smaller and avoids
# `apk` calls that can fail behind TLS-MITM proxies.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder ----------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Backend URL the browser will hit. Defaults to the local dev backend so
# `docker build .` without args still produces a runnable image; CI/CD
# overrides via `--build-arg NEXT_PUBLIC_API_URL=https://api.stadera...`.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm api:types && pnpm build

# ---- runner -----------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user. Cloud Run doesn't enforce this but it's defense-in-depth
# and matches Next.js's official Dockerfile recipe.
RUN addgroup --system --gid 1001 nodejs && \
	adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Cloud Run injects $PORT at runtime; default for local docker run.
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD ["node", "server.js"]
