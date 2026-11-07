# PulseCRM API (Express) image.
# Base is glibc, not alpine: bcrypt 6 ships a prebuilt linux-x64 binary;
# alpine/musl would force a node-gyp compile and need python3/make/g++.
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# PDF reports are written here at runtime (sent via Telegram sendDocument);
# must be writable by the non-root user.
RUN mkdir -p reports && chown -R node:node /app
USER node
# verified: env.PORT defaults to 5000 (server/config/env.js)
EXPOSE 5000
CMD ["node", "index.js"]
