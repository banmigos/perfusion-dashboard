# syntax=docker/dockerfile:1
# Production image — see docs/deployment.md §3. Multi-stage: build with
# Next.js standalone output, copy only the standalone server, static assets
# and public/ into a minimal runtime stage.

FROM node:22-alpine AS deps
WORKDIR /app
# Toolchain only for the better-sqlite3 source-build fallback on musl.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
# Must match the owner of <DATA_DIR> on the host (docs/deployment.md §12).
ARG APP_UID=1000
ARG APP_GID=1000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/app.db

# HOSTNAME=0.0.0.0 is required inside a container; the loopback-only rule is
# enforced at the publish boundary (ports: "127.0.0.1:3000:3000"). See CLAUDE.md.

# The base image ships a `node` user at 1000:1000; drop it so any UID/GID works.
RUN deluser node 2>/dev/null || true; delgroup node 2>/dev/null || true; \
    addgroup -g "${APP_GID}" app && \
    adduser -D -H -u "${APP_UID}" -G app -s /sbin/nologin app && \
    mkdir /data && chown app:app /data

WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app:app
EXPOSE 3000
CMD ["node", "server.js"]
