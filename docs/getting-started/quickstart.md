# Quick Start

## 1) Install dependencies

```bash
bun install
```

## 2) Start local infra

```bash
docker compose -f docker-compose.local-dev.yml up -d
```

Infra endpoints:
- LocalStack: `http://localhost:4566`
- Keycloak: `http://localhost:8090`

## 3) Start the app

Backend:

```bash
bun run dev:server
```

Frontend:

```bash
bun run dev:web
```

App endpoints:
- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## 4) Verify

```bash
curl http://localhost:3000/health
curl http://localhost:3000/trpc/health.info
```

## 5) Run tests

```bash
bun run test:server
bun run test:web
```
