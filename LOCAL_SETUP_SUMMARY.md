# Local Development Setup - Summary

## What's Been Added

This project now supports **three ways** to run locally for development and debugging, with **full support for Docker, Podman, and other OCI-compliant runtimes**.

## Container Runtime Support

### Supported Runtimes
- ✅ **Docker** (with Docker Compose or docker compose plugin)
- ✅ **Podman** (with podman-compose or built-in compose)
- ✅ **Other OCI-compliant runtimes**

### Auto-Detection
All scripts and tools automatically detect and use your installed runtime:
- `start-local.sh` / `start-local.bat` - Auto-detect and start
- `Makefile` - Universal commands that work with any runtime
- Separate compose files for optimal compatibility

### Quick Start

**Universal (works with any runtime):**
```bash
make dev                # Auto-detects runtime
./start-local.sh        # Linux/macOS  
start-local.bat         # Windows
```

**Docker:**
```bash
docker-compose up
```

**Podman:**
```bash
podman-compose up
```

## Three Development Options
### 1. Containers (Docker/Podman) - Easiest & Recommended
**Files added:**
- `docker-compose.yml` - Standard compose file (works with Docker and Podman)
- `podman-compose.yml` - Podman-optimized compose file
- `Dockerfile.dev` - Development Docker image with hot reload
- `Makefile` - Universal commands for any runtime
- `start-local.sh` / `start-local.bat` - Auto-detection startup scripts
- `.env.local` - Local development environment template
- `scripts/localstack-init.sh` - LocalStack initialization script

**Usage:**
```bash
# Auto-detect runtime and start
make dev

# Or use scripts
./start-local.sh        # Linux/macOS
start-local.bat         # Windows

# Or use compose directly
docker-compose up       # Docker
podman-compose up       # Podman

# Access at http://localhost:8080
```

**Podman-specific features:**
- Rootless containers (no sudo required)
- SELinux compatibility (`:Z` volume flags)
- Systemd service generation
- Full Docker compatibility

### 2. Direct Python Execution (Best for Debugging)
**Files modified:**
- `config.py` - Added `LOCAL_DEV_MODE` support
- `app/auth/__init__.py` - Added mock authentication for local dev
- `requirements.txt` - Core production dependencies
- `requirements-dev.txt` - Development and testing dependencies (including optional moto)

**Usage:**
```bash
# Copy environment file
cp .env.local .env

# Install dependencies
pip install -r requirements.txt

# For development tools and testing
pip install -r requirements-dev.txt

# Start LocalStack separately
docker run -p 4566:4566 localstack/localstack

# Run the app
python run.py

# Access at http://localhost:8080
```

### 3. Local Kubernetes (Production-like Testing)
**Files added:**
- `k8s-local/localstack.yaml` - LocalStack deployment for k8s
- `k8s-local/values-local.yaml` - Helm values for local k8s
- `k8s-local/README.md` - Detailed k8s setup guide

**Usage:**
```bash
# Build and load image
docker build -t s3-manager:dev .
minikube image load s3-manager:dev  # or kind/k3s equivalent

# Deploy LocalStack
kubectl apply -f k8s-local/localstack.yaml -n s3-manager

# Deploy app with Helm
helm install s3-manager ./helm/s3-manager \
  -f k8s-local/values-local.yaml \
  -n s3-manager

# Access
kubectl port-forward -n s3-manager svc/s3-manager 8080:80
```

## Key Features

### Mock Authentication
When `LOCAL_DEV_MODE=true`:
- Bypasses Azure AD OAuth2 completely
- Auto-creates a mock user: "Local Developer" (dev@localhost)
- Default role: S3-Admin (full permissions)
- No login required - instant access

### LocalStack S3
Replaces Rook-Ceph with LocalStack:
- Full S3 API compatibility
- No cloud credentials needed
- Pre-configured test buckets:
  - `test-bucket` - Empty
  - `demo-bucket` - Sample files and folders
  - `uploads` - Empty
- Automatic initialization on startup

### Hot Reload Development
Docker Compose includes volume mounts:
- Code changes reflect immediately
- No need to rebuild containers
- Flask debug mode enabled

### Environment-Based Configuration
All configuration via environment variables:
- `LOCAL_DEV_MODE` - Enable/disable mock auth
- `FLASK_DEBUG` - Enable debug mode
- `DEFAULT_ROLE` - Default permissions in dev mode
- `S3_ENDPOINT` - Point to LocalStack or real S3

## Documentation

- **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** - Complete local dev guide
  - Docker Compose setup
  - Direct Python execution
  - VS Code debugging configuration
  - Troubleshooting tips
  - Environment variable reference

- **[k8s-local/README.md](k8s-local/README.md)** - Kubernetes-specific guide
  - minikube, kind, k3s instructions
  - Image building and loading
  - Port forwarding and ingress
  - Development workflow
  - Debugging commands

## Production vs Development

| Feature | Production | Development (Local) |
|---------|-----------|-------------------|
| **Authentication** | Azure AD OAuth2 | Mock (bypassed) |
| **S3 Service** | Rook-Ceph RGW | LocalStack |
| **Credentials** | Real Azure AD app | None required |
| **SSL/TLS** | Required | Disabled |
| **Debug Mode** | Disabled | Enabled |
| **Permissions** | Role-based (RBAC) | Full (S3-Admin) |
| **Hot Reload** | No | Yes |

## Quick Start

**The absolute fastest way to get started:**

```bash
# Clone the repo (if you haven't already)
git clone https://github.com/basmulder03/s3-manager.git
cd s3-manager

# Start everything (one command)
docker-compose up

# Wait ~30 seconds, then open:
# http://localhost:8080
```

That's it! No Azure AD setup, no credentials, no configuration files.

## Migration Path

When moving from local dev to production:

1. **Set environment variables:**
   ```yaml
   LOCAL_DEV_MODE: false  # Disable mock auth
   FLASK_DEBUG: false     # Disable debug mode
   ```

2. **Configure Azure AD:**
   ```yaml
   AZURE_AD_TENANT_ID: "your-tenant-id"
   AZURE_AD_CLIENT_ID: "your-client-id"
   AZURE_AD_CLIENT_SECRET: "your-client-secret"
   ```

3. **Configure S3:**
   ```yaml
   S3_ENDPOINT: "http://rook-ceph-rgw.rook-ceph.svc.cluster.local:8080"
   S3_ACCESS_KEY: "your-access-key"
   S3_SECRET_KEY: "your-secret-key"
   S3_USE_SSL: true
   S3_VERIFY_SSL: true
   ```

4. **Enable security:**
   ```yaml
   SESSION_COOKIE_SECURE: true
   PIM_ENABLED: true
   ```

## Benefits

### For Development:
- ✅ No cloud dependencies
- ✅ No Azure AD setup required
- ✅ Instant setup (< 1 minute)
- ✅ No credentials needed
- ✅ Full S3 functionality
- ✅ Easy debugging
- ✅ Hot reload enabled
- ✅ Cross-platform (Windows/Linux/macOS)

### For Testing:
- ✅ Isolated environment
- ✅ Reproducible state
- ✅ Reset data easily (`docker-compose down -v`)
- ✅ Test different roles
- ✅ Test S3 operations
- ✅ No production impact

### For CI/CD:
- ✅ Easy integration testing
- ✅ No external dependencies
- ✅ Fast startup
- ✅ Consistent environment
- ✅ Docker-based

## Next Steps

1. **Read the guides:**
   - [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for detailed instructions
   - [k8s-local/README.md](k8s-local/README.md) for Kubernetes setup

2. **Try it out:**
   ```bash
   docker-compose up
   ```

3. **Customize:**
   - Edit `.env.local` for different configurations
   - Modify `DEFAULT_ROLE` to test different permissions
   - Add more test buckets to `scripts/localstack-init.sh`

4. **Share feedback:**
   - Report issues on GitHub
   - Suggest improvements
   - Contribute enhancements

## Troubleshooting

See [LOCAL_DEVELOPMENT.md#troubleshooting](LOCAL_DEVELOPMENT.md#troubleshooting) for common issues and solutions.

## Credits

- **LocalStack** - Local AWS cloud emulator
- **Flask** - Python web framework
- **boto3** - AWS SDK for Python
- **moto** - Mock AWS services for testing
