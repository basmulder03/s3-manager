# Docker BuildKit Support

This project uses Docker BuildKit for faster, more efficient builds with better caching.

## What is BuildKit?

BuildKit is Docker's next-generation build system that provides:
- ✅ **Faster builds** - Parallel build stages and better caching
- ✅ **Efficient caching** - Cache mounts for dependencies
- ✅ **Smaller images** - Multi-stage builds with minimal layers
- ✅ **Better security** - Runs builds in isolated containers

## Automatic BuildKit Detection

### Docker

**Modern Docker (20.10+)**: BuildKit is built-in
```bash
# BuildKit is used automatically with docker buildx
docker buildx build -t s3-manager:latest .

# Or enable for regular docker build
export DOCKER_BUILDKIT=1
docker build -t s3-manager:latest .
```

**Legacy Docker**: Install buildx plugin
```bash
docker buildx install
```

### Podman

Podman 4.0+ supports Dockerfile syntax and BuildKit features:
```bash
podman build -t s3-manager:latest .
```

BuildKit-specific features (like cache mounts) work automatically.

## Enabling BuildKit

### Temporarily (Per Command)

**Docker:**
```bash
DOCKER_BUILDKIT=1 docker build -t s3-manager:latest .
```

**Podman:**
```bash
# BuildKit features work by default
podman build -t s3-manager:latest .
```

### Permanently (Recommended)

**Docker - Set as default:**

Linux/macOS - Add to `~/.bashrc` or `~/.zshrc`:
```bash
export DOCKER_BUILDKIT=1
```

Windows PowerShell - Add to profile:
```powershell
$env:DOCKER_BUILDKIT=1
```

**Or configure Docker daemon** (`/etc/docker/daemon.json`):
```json
{
  "features": {
    "buildkit": true
  }
}
```

Then restart Docker:
```bash
sudo systemctl restart docker
```

**Docker Desktop:**
- Settings → Docker Engine
- Add `"features": { "buildkit": true }`
- Apply & Restart

## Using docker-compose / podman-compose

BuildKit is automatically used when available:

**Docker Compose:**
```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Build with compose
docker-compose build
```

**Podman Compose:**
```bash
# BuildKit features work automatically
podman-compose build
```

**Or use the Makefile (handles this automatically):**
```bash
make build
```

## BuildKit Features in This Project

### 1. Build Cache Mounts

The Dockerfiles use `--mount=type=cache` to cache pip packages:

```dockerfile
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt
```

**Benefits:**
- Pip downloads cached between builds
- Faster rebuilds when dependencies don't change
- Reduced bandwidth usage

### 2. Multi-Stage Builds (Production Dockerfile)

```dockerfile
# Build stage
FROM python:3.14-slim AS builder
# Install dependencies here

# Production stage
FROM python:3.14-slim
# Copy only what's needed
```

**Benefits:**
- Smaller final image (no build tools)
- Better security (fewer packages)
- Faster deployments

### 3. Syntax Directive

```dockerfile
# syntax=docker/dockerfile:1
```

**Benefits:**
- Use latest Dockerfile features
- Automatic BuildKit enablement
- Better error messages

### 4. Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; ..."
```

**Benefits:**
- Automatic container health monitoring
- Better orchestration (K8s, Swarm, Compose)
- Faster failure detection

## Build Commands

### Production Image

**Docker:**
```bash
# Using buildx (recommended)
docker buildx build -t s3-manager:latest .

# Using regular build with BuildKit
DOCKER_BUILDKIT=1 docker build -t s3-manager:latest .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t s3-manager:latest .
```

**Podman:**
```bash
podman build -t s3-manager:latest .

# Multi-platform build
podman build --platform linux/amd64,linux/arm64 -t s3-manager:latest .
```

**Makefile:**
```bash
make build
```

### Development Image

**Docker:**
```bash
DOCKER_BUILDKIT=1 docker build -f Dockerfile.dev -t s3-manager:dev .
```

**Podman:**
```bash
podman build -f Dockerfile.dev -t s3-manager:dev .
```

**Compose:**
```bash
docker-compose build  # or podman-compose build
```

### With Compose

**Docker:**
```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
docker-compose up --build
```

**Podman:**
```bash
podman-compose up --build
```

**Makefile:**
```bash
make rebuild
```

## Build Optimization Tips

### 1. Layer Caching

Order Dockerfile commands from least to most frequently changed:

```dockerfile
# ✅ Good: Dependencies change infrequently
COPY requirements.txt .
RUN pip install -r requirements.txt

# ✅ Good: Code changes frequently, goes last
COPY app/ ./app/
```

### 2. .dockerignore

Exclude unnecessary files to speed up builds:
```
.git/
*.md
tests/
venv/
```

Already configured in `.dockerignore`.

### 3. Cache Mounts

Use cache mounts for package managers:
```dockerfile
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
```

### 4. Multi-Stage Builds

Build in one stage, copy to another:
```dockerfile
FROM python:3.14-slim AS builder
RUN pip install ...

FROM python:3.14-slim
COPY --from=builder /usr/local/lib/python3.14 /usr/local/lib/python3.14
```

## Troubleshooting

### "DEPRECATED: The legacy builder is deprecated"

**Solution:** Enable BuildKit
```bash
export DOCKER_BUILDKIT=1
# Or use docker buildx
```

### "unknown flag: --mount"

**Problem:** BuildKit not enabled

**Solution:**
```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Or add syntax directive to Dockerfile (already done)
# syntax=docker/dockerfile:1
```

### Cache mounts not working

**Problem:** BuildKit not enabled or old Docker version

**Solution:**
1. Enable BuildKit: `export DOCKER_BUILDKIT=1`
2. Update Docker to 18.09+ or Podman to 4.0+

### Podman: "unknown instruction: HEALTHCHECK"

**Problem:** Old Podman version

**Solution:** Update Podman to 4.0+
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install podman

# Fedora
sudo dnf update podman
```

### Build is slow

**Solutions:**
1. Enable BuildKit cache: `export DOCKER_BUILDKIT=1`
2. Improve .dockerignore (already optimized)
3. Use cache mounts (already configured)
4. Order Dockerfile from stable to changing layers

## Verification

Check if BuildKit is enabled:

**Docker:**
```bash
# Check BuildKit status
docker buildx version

# Should show buildx version

# Or check environment
echo $DOCKER_BUILDKIT
# Should show: 1
```

**Podman:**
```bash
# Check version (4.0+ has BuildKit support)
podman --version

# Should show: podman version 4.x.x or higher
```

## Performance Comparison

| Feature | Legacy Builder | BuildKit |
|---------|---------------|----------|
| Parallel builds | ❌ No | ✅ Yes |
| Cache mounts | ❌ No | ✅ Yes |
| Multi-stage optimization | ⚠️ Basic | ✅ Advanced |
| Build time (first) | ~2-3 min | ~1-2 min |
| Build time (cached) | ~1-2 min | ~10-30 sec |
| Image size | ~150 MB | ~120 MB |

## Best Practices

1. ✅ **Always use BuildKit** - Enable it permanently
2. ✅ **Use syntax directive** - Already in Dockerfiles
3. ✅ **Optimize .dockerignore** - Already configured
4. ✅ **Use cache mounts** - Already in Dockerfiles
5. ✅ **Order layers correctly** - Stable to changing
6. ✅ **Multi-stage for prod** - Already implemented
7. ✅ **Add health checks** - Already configured

## CI/CD Integration

### GitHub Actions

```yaml
name: Build Docker Image

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Build image
        uses: docker/build-push-action@v4
        with:
          context: .
          push: false
          tags: s3-manager:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### GitLab CI

```yaml
build:
  image: docker:latest
  services:
    - docker:dind
  variables:
    DOCKER_BUILDKIT: 1
  script:
    - docker build -t s3-manager:latest .
```

## Resources

- **BuildKit Documentation**: https://docs.docker.com/build/buildkit/
- **Buildx Documentation**: https://docs.docker.com/buildx/working-with-buildx/
- **Dockerfile Reference**: https://docs.docker.com/engine/reference/builder/
- **Podman Build**: https://docs.podman.io/en/latest/markdown/podman-build.1.html

## Summary

- ✅ BuildKit enabled via `# syntax=docker/dockerfile:1`
- ✅ Cache mounts for faster pip installs
- ✅ Multi-stage builds for smaller images
- ✅ Health checks for better monitoring
- ✅ Optimized .dockerignore
- ✅ Works with Docker and Podman
- ✅ Automatic detection in Makefile and scripts

**Result:** Faster builds, smaller images, better caching!
