# PulseCRM dashboard — Next.js 16 image with standalone output.
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci \
  --fetch-retries=5 \
  --fetch-retry-mintimeout=20000 \
  --fetch-retry-maxtimeout=120000 \
  --fetch-timeout=600000
# Ensure the Linux SWC binary is present even if the registry flakes mid-install.
RUN --mount=type=cache,target=/root/.npm sh -c '\
  node -e "require.resolve(\"@next/swc-linux-x64-gnu/package.json\")" 2>/dev/null || \
  npm install --no-save --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 @next/swc-linux-x64-gnu@16.3.6'
COPY . .
RUN --mount=type=cache,target=/root/.cache/next-swc NEXT_TELEMETRY_DISABLED=1 npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
CMD ["node", "server.js"]
