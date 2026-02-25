# S3 Manager

A lightweight, secure web application for managing S3 buckets with multi-provider OIDC authentication. Designed for viewing and managing S3-compatible storage (including Rook-Ceph, AWS S3, MinIO, and LocalStack) within Kubernetes clusters or locally.

## Features

- 🔐 **Multi-Provider OIDC Authentication** - Support for Keycloak, Azure AD/Entra ID, and Google OAuth
- 👥 **Role-Based Access Control (RBAC)** - Configurable roles with granular permissions
- 🚪 **Modern Ingress Integration** - First-class Envoy Gateway support with native OIDC + legacy NGINX Ingress
- 📦 **S3 Bucket Management** - View, list, download, upload, and delete objects
- ☸️ **Kubernetes Native** - Deploy via Helm chart with full K8s integration
- 🪶 **Lightweight** - Minimal resource footprint with Python Flask backend
- 🎨 **Modern UI** - Clean, responsive web interface with ES6 modules
- 🐳 **Local Development** - Docker/Podman compose with Keycloak and LocalStack included

## Architecture

The application consists of:
- **Backend**: Python Flask REST API with modular OIDC provider abstraction
- **Frontend**: Vanilla JavaScript ES6 modules with JSDoc type annotations
- **Authentication**: Multi-provider OIDC (Keycloak, Azure AD, Google OAuth)
- **Storage**: S3-compatible storage (Rook-Ceph, AWS S3, MinIO, LocalStack via boto3)
- **Deployment**: Helm chart with Envoy Gateway or NGINX Ingress support

## Project Structure

```
s3-manager/
├── app/                           # Application source code
│   ├── auth/                      # Authentication module (OIDC)
│   ├── s3/                        # S3 operations module
│   ├── static/                    # Frontend assets (JS, CSS)
│   └── templates/                 # HTML templates
├── docs/                          # Documentation
│   ├── getting-started/           # Getting started guides
│   │   ├── quickstart.md          # Quick start guide
│   │   ├── local-development.md   # Local development setup
│   │   ├── configuration.md       # Configuration reference
│   │   └── oidc-providers.md      # OIDC provider setup
│   ├── deployment/                # Deployment documentation
│   │   ├── kubernetes.md          # Kubernetes deployment
│   │   ├── ingress.md             # Ingress setup (Envoy/NGINX)
│   │   └── local-k8s.md           # Local K8s testing
│   └── development/               # Development documentation
│       ├── testing.md             # Testing guide
│       └── dependencies.md        # Dependency management
├── helm/s3-manager/               # Helm chart for Kubernetes
├── k8s/                           # Kubernetes manifests
│   └── local/                     # Full local K8s stack (Envoy + Keycloak + LocalStack)
├── k8s-helm-local/                # Simplified local Helm deployment (LocalStack only)
├── scripts/                       # Utility scripts
└── tests/                         # Test suite (pytest, playwright)
```

### Local Kubernetes Options

Two options are available for local Kubernetes testing:

- **`k8s-helm-local/`**: Simplified Helm deployment with LocalStack S3 only (quick testing)
- **`k8s/local/`**: Full stack with Envoy Gateway, Keycloak, and LocalStack (complete environment)

## Prerequisites

### For Kubernetes Deployment

- Kubernetes cluster (1.26+)
- Helm 3.x
- S3-compatible storage endpoint (Rook-Ceph, AWS S3, MinIO, etc.)
- OIDC provider (Keycloak, Azure AD, or Google OAuth)
- Ingress controller:
  - **Envoy Gateway** (recommended) - Modern Gateway API with native OIDC
  - **NGINX Ingress** (legacy) - Traditional ingress with oauth2-proxy

### For Local Development

- Docker or Podman (for containerized development)
- Python 3.9+ (for direct development)
- See [docs/getting-started/quickstart.md](docs/getting-started/quickstart.md) for detailed local setup

## Quick Start

### Local Development (Fastest Way to Try)

Get started in minutes with Docker/Podman and included Keycloak + LocalStack:

```bash
# Auto-detects Docker or Podman
make dev

# Or use compose directly
docker-compose up       # Docker
docker compose up       # Docker (newer syntax)
podman compose up       # Podman (4.0+)

# Access at http://localhost:8080
# Login with: admin/admin123, editor/editor123, or viewer/viewer123
```

**Quick Start (without Keycloak):**
```bash
make dev-quick          # Starts LocalStack + App only (mock auth)
```

See **[docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)** for complete local development guide.

### Kubernetes Deployment

Choose your preferred deployment method:

#### Option 1: Envoy Gateway with Keycloak (Recommended)

Modern, Kubernetes-native approach with built-in OIDC:

```bash
# 1. Install Envoy Gateway and Gateway API CRDs
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.0.0 -n envoy-gateway-system --create-namespace

# 2. Create OIDC client secret
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='your-keycloak-client-secret'

# 3. Deploy S3 Manager
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-envoy-keycloak.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.keycloak.issuerUrl=https://keycloak.example.com/realms/s3-manager
```

#### Option 2: Envoy Gateway with Azure AD

For organizations using Microsoft Entra ID (Azure AD):

```bash
# Deploy with Azure AD configuration
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-envoy-azure.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.azure.issuerUrl=https://login.microsoftonline.com/<tenant-id>/v2.0 \
  --set ingress.envoy.oidc.azure.clientId=<application-client-id> \
  --set config.azure.tenantId=<tenant-id> \
  --set config.azure.clientId=<application-client-id>
```

#### Option 3: NGINX Ingress (Legacy)

For existing NGINX Ingress deployments (requires oauth2-proxy):

```bash
# Deploy with NGINX Ingress
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-nginx.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com
```

See **[docs/deployment/ingress.md](docs/deployment/ingress.md)** for comprehensive deployment guides.

## Documentation

### Getting Started
- **[docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)** - Local development quick start guide
- **[docs/getting-started/local-development.md](docs/getting-started/local-development.md)** - Detailed local development setup
- **[docs/getting-started/configuration.md](docs/getting-started/configuration.md)** - Configuration reference
- **[docs/getting-started/oidc-providers.md](docs/getting-started/oidc-providers.md)** - OIDC provider configuration (Keycloak, Azure AD, Google)

### Deployment
- **[docs/deployment/kubernetes.md](docs/deployment/kubernetes.md)** - Kubernetes deployment guide
- **[docs/deployment/ingress.md](docs/deployment/ingress.md)** - Kubernetes ingress deployment guide (Envoy Gateway, NGINX)
- **[docs/deployment/local-k8s.md](docs/deployment/local-k8s.md)** - Local Kubernetes testing with Envoy Gateway, Keycloak, and Rook-Ceph

### Development
- **[docs/development/testing.md](docs/development/testing.md)** - Comprehensive testing documentation
- **[docs/development/dependencies.md](docs/development/dependencies.md)** - Dependency details and management

## Configuration Examples

### OIDC Providers

S3 Manager supports three OIDC providers. See [docs/getting-started/oidc-providers.md](docs/getting-started/oidc-providers.md) for detailed setup instructions.

#### Keycloak Configuration

```yaml
config:
  oidcProvider: keycloak
  keycloak:
    authority: https://keycloak.example.com/realms/s3-manager
    clientId: s3-manager-client
    redirectUri: https://s3-manager.example.com/auth/callback
    scope: "openid profile email roles"
    roleMapping:
      S3-Admin: [view, write, delete]
      S3-Editor: [view, write]
      S3-Viewer: [view]
```

#### Azure AD Configuration

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click "New registration"
3. Configure:
   - Name: `S3 Manager`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: `https://your-domain.com/auth/callback` (Web)
4. After creation, note down:
   - Application (client) ID
   - Directory (tenant) ID
5. Create a client secret:
   - Go to Certificates & secrets → New client secret
   - Note down the secret value
6. Configure API permissions:
   - Add Microsoft Graph → Delegated permissions → `User.Read`
   - Add Microsoft Graph → Delegated permissions → `GroupMember.Read.All`
   - Grant admin consent

7. Create security groups for different access levels:
   - `S3-Viewer` - Read-only access
   - `S3-Editor` - Read and write access
   - `S3-Admin` - Full access (read, write, delete)

```yaml
config:
  oidcProvider: azure
  azure:
    tenantId: "your-tenant-id"
    clientId: "your-client-id"
    redirectUri: https://s3-manager.example.com/auth/callback
    scope: "openid profile email User.Read GroupMember.Read.All"
    roleMapping:
      "group-object-id-1": [view, write, delete]  # S3-Admin group
      "group-object-id-2": [view, write]          # S3-Editor group
      "group-object-id-3": [view]                 # S3-Viewer group
```

#### Google OAuth Configuration

```yaml
config:
  oidcProvider: google
  google:
    clientId: "your-google-client-id"
    redirectUri: https://s3-manager.example.com/auth/callback
    scope: "openid profile email"
    allowedDomains: ["example.com"]
    domainRoleMapping:
      "admin@example.com": [view, write, delete]
      "example.com": [view]  # Default for domain
```

### Ingress Configuration

#### Envoy Gateway (Recommended)

```yaml
ingress:
  enabled: true
  type: envoy
  gatewayApi:
    gatewayName: eg
    gatewayNamespace: envoy-gateway-system
  hostname: s3-manager.example.com
  
  envoy:
    oidc:
      enabled: true
      provider: keycloak
      keycloak:
        issuerUrl: https://keycloak.example.com/realms/s3-manager
        clientId: s3-manager-client
        clientSecretRef:
          name: s3-manager-oidc-secret
          key: client-secret
    
    rateLimiting:
      enabled: true
      requests: 100
      unit: Second
    
    securityHeaders:
      enabled: true
      strictTransportSecurity: "max-age=31536000; includeSubDomains"
```

#### NGINX Ingress (Legacy)

```yaml
ingress:
  enabled: true
  type: nginx
  className: nginx
  hostname: s3-manager.example.com
  
  nginx:
    oauth2Proxy:
      enabled: true
      url: http://oauth2-proxy.auth-system.svc.cluster.local
    annotations:
      nginx.ingress.kubernetes.io/limit-rps: "100"
```

### Role Permissions

Configure role-to-permission mappings in `values.yaml`:

```yaml
config:
  rolePermissions:
    S3-Viewer:
      - view
    S3-Editor:
      - view
      - write
    S3-Admin:
      - view
      - write
      - delete
  defaultRole: "S3-Viewer"
```

### S3 Configuration

Configure S3/Rook-Ceph connection:

#### Get Rook-Ceph S3 Credentials

```bash
# Get the RGW endpoint
kubectl get svc -n rook-ceph rook-ceph-rgw-my-store

# Get S3 credentials
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user -o jsonpath='{.data.AccessKey}' | base64 -d
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user -o jsonpath='{.data.SecretKey}' | base64 -d
```

#### Configuration in values.yaml

```yaml
config:
  s3:
    endpoint: "http://rook-ceph-rgw.rook-ceph.svc.cluster.local:8080"
    accessKey: "your-access-key"
    secretKey: "your-secret-key"
    region: "us-east-1"
    useSSL: false
    verifySSL: false
```

## Development

### Local Development with Containers

For local development and debugging without Azure AD or Rook-Ceph, the fastest way is using Docker/Podman with included Keycloak and LocalStack:

```bash
# Auto-detects Docker or Podman
make dev

# Or use the start script
./start-local.sh        # Linux/macOS
start-local.bat         # Windows

# Or use compose directly
docker-compose up       # Docker
podman-compose up       # Podman

# Access at http://localhost:8080
# Login with pre-configured users:
#   - admin/admin123 (full permissions)
#   - editor/editor123 (view + write)
#   - viewer/viewer123 (view only)
```

**Container Runtime Support:**

This project supports multiple container runtimes out of the box:
- ✅ **Docker** (with Docker Compose)
- ✅ **Podman** (4.0+ with built-in compose support)
- ✅ **Other OCI-compliant runtimes**

For more local development options, see:
- **[docs/getting-started/quickstart.md](docs/getting-started/quickstart.md)** - Quick start guide
- **[docs/getting-started/local-development.md](docs/getting-started/local-development.md)** - Detailed local development setup

### Production-like Local Development

1. Clone the repository:
```bash
git clone https://github.com/basmulder03/s3-manager.git
cd s3-manager
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies:
```bash
# Production dependencies only
pip install -r requirements.txt

# Or install with development tools (testing, linting, etc.)
pip install -r requirements-dev.txt
```

4. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Run the application:
```bash
python run.py
```

The application will be available at `http://localhost:8080`.

**Note:** For dependency details, see [docs/development/dependencies.md](docs/development/dependencies.md).

### Building Docker Image

```bash
docker build -t s3-manager:latest .
```

### Automated GitHub Container Registry Builds

This repository includes a GitHub Actions workflow that builds and pushes the Docker image to the free GitHub Container Registry (GHCR) on every push to `main` and on version tags (`v*`):

```bash
ghcr.io/basmulder03/s3-manager
```

If you publish from a fork, use the image path for your GitHub organization or username.

Use the published image in your Helm values or Kubernetes manifests.

### Testing Helm Chart

```bash
# Template rendering
helm template s3-manager ./helm/s3-manager -f values.yaml

# Lint chart
helm lint ./helm/s3-manager

# Dry run
helm install s3-manager ./helm/s3-manager -f values.yaml --dry-run --debug
```

## API Endpoints

### Authentication
- `GET /auth/login` - Initiate OIDC login
- `GET /auth/callback` - OAuth callback
- `GET /auth/logout` - Logout
- `GET /auth/user` - Get current user info

### S3 Operations
- `GET /api/s3/buckets` - List all buckets
- `GET /api/s3/buckets/<bucket>/objects` - List objects in bucket
- `GET /api/s3/buckets/<bucket>/objects/<key>` - Get object metadata
- `PUT /api/s3/buckets/<bucket>/objects/<key>` - Upload object (requires write permission)
- `DELETE /api/s3/buckets/<bucket>/objects/<key>` - Delete object (requires delete permission)

## Security Considerations

1. **Secrets Management**: Use Kubernetes secrets or external secret managers (e.g., Azure Key Vault, HashiCorp Vault, Sealed Secrets)
2. **TLS/SSL**: Always use HTTPS in production with valid certificates (use cert-manager for automated certificate management)
3. **Session Security**: Configure secure session cookies with appropriate expiration and secure flags
4. **Network Policies**: Restrict access to S3 endpoints and OIDC providers within the cluster
5. **RBAC**: Follow principle of least privilege for role assignments
6. **Audit Logging**: Enable logging for all operations and authentication events
7. **Regular Updates**: Keep dependencies and base images updated for security patches
8. **OIDC Client Secrets**: Rotate client secrets regularly and store them securely in Kubernetes secrets
9. **Rate Limiting**: Configure appropriate rate limits to prevent abuse (built-in with Envoy Gateway)
10. **Security Headers**: Enable security headers (CSP, HSTS, X-Frame-Options) via ingress configuration

## Troubleshooting

### Authentication Issues

```bash
# Check OIDC configuration
kubectl logs -n s3-manager deployment/s3-manager | grep "oidc\|auth"

# Verify redirect URI matches
echo "https://$(kubectl get ingress -n s3-manager s3-manager -o jsonpath='{.spec.rules[0].host}')/auth/callback"

# For Envoy Gateway, check SecurityPolicy
kubectl describe securitypolicy -n s3-manager

# For NGINX Ingress, check oauth2-proxy
kubectl logs -n auth-system -l app=oauth2-proxy
```

### S3 Connection Issues

```bash
# Test S3 endpoint from within cluster
kubectl run -it --rm test --image=amazon/aws-cli --restart=Never -- \
  s3 ls --endpoint-url=http://rook-ceph-rgw.rook-ceph.svc.cluster.local:8080

# Check S3 credentials
kubectl get secret -n s3-manager s3-manager -o jsonpath='{.data.S3_ACCESS_KEY}' | base64 -d
```

### View Application Logs

```bash
kubectl logs -n s3-manager -l app.kubernetes.io/name=s3-manager -f
```

## Testing

S3 Manager includes comprehensive automated tests covering backend APIs and frontend UI.

### Running Tests Locally

**Prerequisites:**
```bash
# Install test dependencies
pip install -r requirements-dev.txt

# Install Playwright browsers (for E2E tests)
playwright install chromium

# Start LocalStack for S3 emulation
make start  # or docker-compose up -d localstack
```

**Run all tests:**
```bash
# Using Makefile (recommended)
make test-all

# Or using pytest directly
pytest -v
```

**Run specific test suites:**
```bash
# Backend API tests only
make test-api

# E2E UI tests only
make test-e2e

# With coverage report
make test-coverage

# Quick tests (unit + api, no E2E)
make test-quick
make test-e2e
make test-coverage
```

**Run tests in Docker:**
```bash
make test-docker
```

### Test Categories

- **Backend API Tests** - Unit and integration tests for Flask endpoints
- **E2E UI Tests** - Browser-based tests using Playwright
- **Integration Tests** - Tests requiring LocalStack S3
- **Unit Tests** - Fast, isolated tests with no external dependencies

### Test Markers

```bash
pytest -m api          # Backend API tests
pytest -m e2e          # End-to-end UI tests
pytest -m integration  # Integration tests
pytest -m unit         # Unit tests only
```

See [docs/development/testing.md](docs/development/testing.md) for comprehensive testing documentation.

## Quick Reference

### One-Command Startup

```bash
make dev              # Auto-detects Docker/Podman, starts everything
```

**Quick mode (no Keycloak):**
```bash
make dev-quick        # Mock auth, faster startup
```

### Common Commands

| Action | Make (Recommended) | Docker/Podman |
|--------|-------------------|---------------|
| Start full stack | `make dev` or `make start` | `docker compose up -d` or `podman compose up -d` |
| Start quick mode | `make dev-quick` | `docker compose up -d localstack s3-manager` |
| Stop | `make stop` | `docker compose down` or `podman compose down` |
| Logs | `make logs` | `docker compose logs -f` or `podman compose logs -f` |
| Clean | `make clean` | `docker compose down -v` or `podman compose down -v` |
| Rebuild | `make rebuild` | `docker compose build` or `podman compose build` |
| Shell | `make shell` | `docker exec -it s3-manager-app sh` |
| Status | `make status` | `docker compose ps` or `podman compose ps` |

### Access Points

- **Application**: http://localhost:8080
- **LocalStack S3**: http://localhost:4566

### Default Credentials (Local Dev Mode)

- **Users**: admin/admin123, editor/editor123, viewer/viewer123
- **S3 Access Key**: test
- **S3 Secret Key**: test

### Quick Tests

```bash
# Test S3 endpoint
curl http://localhost:4566/_localstack/health

# Test application
curl http://localhost:8080/auth/user

# Run all tests
make test
```

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass (`make test-all`)
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: [basmulder03/s3-manager](https://github.com/basmulder03/s3-manager/issues)
- Documentation: [GitHub Wiki](https://github.com/basmulder03/s3-manager/wiki)
