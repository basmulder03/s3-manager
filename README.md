# S3 Manager

A lightweight, secure web application for managing S3 buckets with Microsoft Entra ID (Azure AD) authentication and Privileged Identity Management (PIM) integration. Designed specifically for viewing and managing Rook-Ceph S3 buckets within Kubernetes clusters.

## Features

- 🔐 **Microsoft Entra ID Authentication** - Secure OAuth2 authentication with Azure AD
- 👥 **Role-Based Access Control (RBAC)** - Configurable roles with granular permissions
- 🔑 **PIM Integration** - Privilege elevation through Azure Privileged Identity Management
- 📦 **S3 Bucket Management** - View, list, download, upload, and delete objects
- ☸️ **Kubernetes Native** - Deploy via Helm chart with full K8s integration
- 🪶 **Lightweight** - Minimal resource footprint with Python Flask backend
- 🎨 **Modern UI** - Clean, responsive web interface

## Architecture

The application consists of:
- **Backend**: Python Flask REST API
- **Frontend**: Vanilla JavaScript with modern CSS
- **Authentication**: Microsoft Entra ID OAuth2 + MSAL
- **Storage**: Rook-Ceph S3 (via boto3)
- **Deployment**: Helm chart for Kubernetes

## Prerequisites

- Kubernetes cluster (1.20+)
- Helm 3.x
- Rook-Ceph deployed with RGW (S3 gateway)
- Microsoft Entra ID (Azure AD) tenant
- Azure AD application registration

## Quick Start

### 1. Register Azure AD Application

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

### 2. Create Azure AD Groups (Roles)

Create security groups for different access levels:
- `S3-Viewer` - Read-only access
- `S3-Editor` - Read and write access
- `S3-Admin` - Full access (read, write, delete)

Assign users to appropriate groups.

### 3. Get Rook-Ceph S3 Credentials

```bash
# Get the RGW endpoint
kubectl get svc -n rook-ceph rook-ceph-rgw-my-store

# Get S3 credentials
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user -o jsonpath='{.data.AccessKey}' | base64 -d
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user -o jsonpath='{.data.SecretKey}' | base64 -d
```

### 4. Configure Helm Values

Create a `values.yaml` file:

```yaml
image:
  repository: your-registry/s3-manager
  tag: "1.0.0"

ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: s3-manager.your-domain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: s3-manager-tls
      hosts:
        - s3-manager.your-domain.com

config:
  secretKey: "generate-a-secure-random-key-here"
  
  azureAd:
    tenantId: "your-tenant-id"
    clientId: "your-client-id"
    clientSecret: "your-client-secret"
  
  pim:
    enabled: true
  
  s3:
    endpoint: "http://rook-ceph-rgw.rook-ceph.svc.cluster.local:8080"
    accessKey: "your-s3-access-key"
    secretKey: "your-s3-secret-key"
    region: "us-east-1"
```

### 5. Deploy with Helm

```bash
# Build and push Docker image
docker build -t your-registry/s3-manager:1.0.0 .
docker push your-registry/s3-manager:1.0.0

# Install Helm chart
helm install s3-manager ./helm/s3-manager -f values.yaml -n s3-manager --create-namespace

# Check deployment status
kubectl get pods -n s3-manager
kubectl get ingress -n s3-manager
```

### 6. Access the Application

Navigate to `https://s3-manager.your-domain.com` and log in with your Microsoft account.

## Configuration

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

### PIM Configuration

Enable PIM for privilege elevation:

```yaml
config:
  pim:
    enabled: true
```

When enabled, users can request elevated privileges through the UI, which triggers Azure PIM workflows.

### S3 Configuration

Configure S3/Rook-Ceph connection:

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

### Local Development

For local development and debugging without Azure AD or Rook-Ceph, see **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** for detailed instructions on:

- Running with containers (Docker/Podman) + LocalStack (S3 emulator)
- Running directly with Python for debugging
- Deploying to local Kubernetes clusters (minikube, kind, k3s)
- Mock authentication bypass for development

**Container Runtime Support:**

This project supports multiple container runtimes out of the box:
- ✅ **Docker** (with Docker Compose)
- ✅ **Podman** (with podman-compose)
- ✅ **Other OCI-compliant runtimes**

See **[CONTAINER_RUNTIMES.md](CONTAINER_RUNTIMES.md)** for Podman setup, rootless containers, and systemd integration.

**Quick Start:**

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
# Auto-logged in as "Local Developer" with full permissions
```

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
pip install -r requirements.txt
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
- `GET /auth/login` - Initiate Azure AD login
- `GET /auth/callback` - OAuth callback
- `GET /auth/logout` - Logout
- `GET /auth/user` - Get current user info
- `POST /auth/pim/elevate` - Request PIM elevation

### S3 Operations
- `GET /api/s3/buckets` - List all buckets
- `GET /api/s3/buckets/<bucket>/objects` - List objects in bucket
- `GET /api/s3/buckets/<bucket>/objects/<key>` - Get object metadata
- `PUT /api/s3/buckets/<bucket>/objects/<key>` - Upload object (requires write permission)
- `DELETE /api/s3/buckets/<bucket>/objects/<key>` - Delete object (requires delete permission)

## Security Considerations

1. **Secrets Management**: Use Kubernetes secrets or external secret managers (e.g., Azure Key Vault, HashiCorp Vault)
2. **TLS/SSL**: Always use HTTPS in production with valid certificates
3. **Session Security**: Configure secure session cookies
4. **Network Policies**: Restrict access to S3 endpoints within the cluster
5. **RBAC**: Follow principle of least privilege for role assignments
6. **Audit Logging**: Enable logging for all operations
7. **Regular Updates**: Keep dependencies and base images updated

## Troubleshooting

### Authentication Issues

```bash
# Check Azure AD configuration
kubectl logs -n s3-manager deployment/s3-manager | grep "auth"

# Verify redirect URI matches
echo "https://$(kubectl get ingress -n s3-manager s3-manager -o jsonpath='{.spec.rules[0].host}')/auth/callback"
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

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: [basmulder03/s3-manager](https://github.com/basmulder03/s3-manager/issues)
- Documentation: [GitHub Wiki](https://github.com/basmulder03/s3-manager/wiki)
