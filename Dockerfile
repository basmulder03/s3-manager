FROM oven/bun:1.3.10 AS builder

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/server/package.json ./packages/server/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN bun install --frozen-lockfile

COPY packages/server ./packages/server
COPY packages/web ./packages/web

RUN bun run build


FROM oven/bun:1.3.10 AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/web/dist ./packages/web/dist

EXPOSE 3000

CMD ["bun", "/app/packages/server/dist/index.js"]
