# syntax=docker/dockerfile:1
# Barkat: single Next.js app (UI and API in one process).

FROM node:25-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:25-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN npm run build

FROM node:25-bookworm-slim

ARG VERSION=dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.title="Barkat" \
      org.opencontainers.image.description="Household bills, income and cushion, tracked week by week" \
      org.opencontainers.image.source="https://github.com/elekib/barkat" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BARKAT_DATA_DIR=/app/data \
    BARKAT_VERSION=${VERSION} \
    BARKAT_GIT_SHA=${GIT_SHA}

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/peer.cjs ./peer.cjs
COPY docker-entrypoint.sh /usr/local/bin/barkat-entrypoint

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["barkat-entrypoint"]
# peer.cjs records the real client address for rate limiting. node:sqlite is stable
# in practice on the pinned Node 22 image; hide its "experimental" notice.
CMD ["node", "--require", "./peer.cjs", "--disable-warning=ExperimentalWarning", "server.js"]
