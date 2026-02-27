# Local Development

## Prerequisites

- Bun 1.3+
- Docker with Compose (for LocalStack/Keycloak)

## 1) Install dependencies

```bash
bun install
```

## 2) Start local infrastructure

```bash
docker compose -f docker-compose.local-dev.yml up -d
```

This starts:

- LocalStack (`localhost:4566`)
- Keycloak (`localhost:8090`)

## 3) Run backend and frontend

In separate terminals:

```bash
bun run dev:server
bun run dev:web
```

Use these local Keycloak credentials to sign in:

- Username: `admin`
- Password: `admin123`

## 4) Verify

```bash
curl http://localhost:3000/health
curl http://localhost:4566/_localstack/health
```

Open `http://localhost:5173`.

Authentication is required in local development (`AUTH_REQUIRED=true`, `LOCAL_DEV_MODE=false`).
