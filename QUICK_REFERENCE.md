# Quick Reference - Container Runtimes

## One-Command Startup

### Universal (Works with Docker or Podman)
```bash
make dev              # Detects runtime, starts everything
./start-local.sh      # Linux/macOS
start-local.bat       # Windows
```

### Docker
```bash
docker-compose up
# or
docker compose up
```

### Podman
```bash
podman-compose up
# or
podman compose up     # Podman 4.0+
```

## Common Commands

| Action | Make | Docker | Podman |
|--------|------|--------|--------|
| Start | `make start` | `docker-compose up -d` | `podman-compose up -d` |
| Stop | `make stop` | `docker-compose down` | `podman-compose down` |
| Logs | `make logs` | `docker-compose logs -f` | `podman-compose logs -f` |
| Clean | `make clean` | `docker-compose down -v` | `podman-compose down -v` |
| Rebuild | `make rebuild` | `docker-compose build` | `podman-compose build` |
| Shell | `make shell` | `docker exec -it s3-manager-app sh` | `podman exec -it s3-manager-app sh` |
| Status | `make status` | `docker-compose ps` | `podman-compose ps` |

## Access Points

- **Application**: http://localhost:8080
- **LocalStack S3**: http://localhost:4566

## Default Credentials (Local Dev Mode)

- **User**: Local Developer (dev@localhost)
- **Role**: S3-Admin (full permissions)
- **S3 Access Key**: test
- **S3 Secret Key**: test

## Quick Tests

```bash
# Test S3 endpoint
curl http://localhost:4566/_localstack/health

# Test application
curl http://localhost:8080/auth/user

# Run all tests
make test
```

## Troubleshooting

### Port already in use
```bash
# Find what's using port 8080
lsof -i :8080                    # Linux/macOS
netstat -ano | findstr :8080     # Windows

# Kill the process or change port in compose file
```

### Podman: Permission denied
```bash
# Ensure using rootless mode
podman info | grep rootless

# Check SELinux labels (volumes should have :Z flag)
```

### Docker: Cannot connect to daemon
```bash
# Start Docker daemon
sudo systemctl start docker      # Linux
# Or start Docker Desktop        # macOS/Windows
```

### Services won't start
```bash
# Check logs
make logs

# Clean and restart
make clean
make start
```

## File Locations

- **Compose files**: `docker-compose.yml`, `podman-compose.yml`
- **Environment**: `.env.local`
- **Init script**: `scripts/localstack-init.sh`
- **Development Dockerfile**: `Dockerfile.dev`

## Documentation

- **Local Development**: [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
- **Container Runtimes**: [CONTAINER_RUNTIMES.md](CONTAINER_RUNTIMES.md)
- **Kubernetes Setup**: [k8s-local/README.md](k8s-local/README.md)
- **Main README**: [README.md](README.md)

## Runtime Detection

The `start-local.sh` and `Makefile` automatically detect your runtime:

1. Check for `podman` → Use Podman
2. Check for `docker` → Use Docker
3. Select appropriate compose command
4. Choose correct compose file

## Podman-Specific Features

### Rootless Mode
```bash
# Run without sudo (Linux)
podman-compose up
```

### Systemd Integration
```bash
# Generate systemd services
make podman-generate-systemd

# Install as system services
make podman-install-systemd

# Enable and start
sudo systemctl enable --now s3-manager-app
```

### Check Rootless Status
```bash
podman info | grep rootless
# Should show: rootless: true
```

## Environment Variables

Key variables in `.env.local`:

```bash
LOCAL_DEV_MODE=true        # Enable mock authentication
FLASK_DEBUG=true           # Enable debug mode
DEFAULT_ROLE=S3-Admin      # Default permissions
S3_ENDPOINT=http://localhost:4566
S3_ACCESS_KEY=test
S3_SECRET_KEY=test
```

## Next Steps

1. Start services: `make dev`
2. Open browser: http://localhost:8080
3. Start developing!

For more details, see the full documentation linked above.
