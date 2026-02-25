# Local Development Guide

This guide explains how to run the S3 Manager application locally for development and debugging purposes.

## Overview

The S3 Manager can be run locally in two ways:

1. **Docker Compose / Podman**: Complete local environment with LocalStack (S3 emulator)
2. **Direct Python**: Run the Flask app directly against LocalStack or mock S3
3. **Local Kubernetes**: Deploy to local k8s cluster (minikube, kind, k3s)

## Prerequisites

- **Container Runtime**: Docker or Podman
- **Python 3.12+** (for direct Python execution)
- **kubectl** and a local Kubernetes cluster (for k8s setup)

## Container Runtime Support

This project supports **Docker**, **Podman**, and other OCI-compliant runtimes out of the box with automatic detection. See the "Container Runtime Details" section below for more information.

## Option 1: Container-based (Recommended)

This is the easiest way to get started. Works with Docker, Podman, or compatible runtimes.

### Quick Start

**Using auto-detection:**
```bash
# Auto-detects Docker or Podman
make dev
```

**Using Make (recommended):**
```bash
# Auto-detects Docker or Podman
make dev

# Or just start services
make start

# View all commands
make help
```

**Using Docker Compose:**
```bash
docker-compose up
# or
docker compose up       # Newer Docker versions
```

**Using Podman:**
```bash
podman compose up       # Podman 4.0+
```

### What Gets Started

This will start:
- LocalStack S3 service on port 4566
- S3 Manager application on port 8080

### Access

- Application: http://localhost:8080
- LocalStack S3 endpoint: http://localhost:4566

3. **Default credentials:**
   - **User**: Local Developer (dev@localhost)
   - **Role**: S3-Admin (full permissions)
   - **S3 Access Key**: test
   - **S3 Secret Key**: test

### Pre-configured Buckets

The LocalStack initialization script creates three test buckets:
- `test-bucket` - Empty bucket for testing
- `demo-bucket` - Contains sample files and folder structure
- `uploads` - Empty bucket for upload testing

### Development Workflow

The container setup includes hot-reload, so code changes are reflected immediately:

```bash
# Edit files in ./app/
# Changes are automatically picked up
# Refresh browser to see updates
```

### Useful Commands

```bash
# Using Make (works with Docker or Podman)
make start          # Start services
make stop           # Stop services
make restart        # Restart services
make logs           # View all logs
make logs-app       # View app logs only
make clean          # Stop and remove volumes
make shell          # Open shell in app container
make test           # Test connectivity

# Using compose directly
docker compose logs -f         # Docker
podman compose logs -f         # Podman
```

### Stopping Services

```bash
# Using Make
make stop

# Using compose
docker compose down            # Docker/Podman

# Stop and remove all data
make clean
# or
docker compose down -v         # Docker/Podman
```

## Option 2: Direct Python Execution

Run the Flask app directly on your machine for easier debugging.

### Setup

1. **Create and activate virtual environment:**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start LocalStack (in a separate terminal):**
   ```bash
   docker run --rm -d \
     -p 4566:4566 \
     -e SERVICES=s3 \
     --name localstack \
     localstack/localstack:latest
   ```

4. **Create test buckets:**
   ```bash
   # Install AWS CLI if not already installed
   pip install awscli-local
   
   # Create buckets
   awslocal s3 mb s3://test-bucket
   awslocal s3 mb s3://demo-bucket
   awslocal s3 mb s3://uploads
   ```

5. **Configure environment:**
   ```bash
   # Copy the local development environment file
   cp .env.local .env
   ```

6. **Run the application:**
   ```bash
   python run.py
   ```

7. **Access the application:**
   - Application: http://localhost:8080
   - You'll be automatically logged in as "Local Developer"

### Debugging with VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Flask",
      "type": "debugpy",
      "request": "launch",
      "module": "flask",
      "env": {
        "FLASK_APP": "run.py",
        "FLASK_DEBUG": "1",
        "LOCAL_DEV_MODE": "true"
      },
      "args": [
        "run",
        "--no-debugger",
        "--no-reload"
      ],
      "jinja": true,
      "console": "integratedTerminal"
    }
  ]
}
```

### Alternative: Using Moto (In-Memory S3)

For unit testing without running LocalStack, you can use moto:

**Install dev dependencies:**
```bash
pip install -r requirements-dev.txt
```

**Uncomment moto in requirements-dev.txt:**
```python
# Uncomment this line in requirements-dev.txt:
moto[s3]>=5.0,<6.0
```

**Example test setup with moto:**
```python
from moto import mock_aws
import boto3

@mock_aws
def test_list_buckets():
    # Moto creates an in-memory S3 service
    conn = boto3.client('s3', region_name='us-east-1')
    conn.create_bucket(Bucket='test-bucket')
    
    # Your test code here
    buckets = conn.list_buckets()
    assert len(buckets['Buckets']) == 1
```

**Note:** For local development, we recommend using LocalStack in containers instead of moto, as it provides a more complete S3 API implementation and better matches production behavior.

## Option 3: Local Kubernetes Cluster

Deploy to a local Kubernetes cluster for testing Helm charts and k8s-specific features.

**Key Features:**
- ✅ Uses PersistentVolumeClaim for LocalStack data (survives pod restarts)
- ✅ Automatic storage provisioning (kind, minikube, k3s all supported)
- ✅ Full Helm chart testing environment
- ✅ Production-like deployment workflow

### Prerequisites

- Local Kubernetes cluster (minikube, kind, or k3s)
- kubectl configured
- Helm 3.x

### Quick Start (All Platforms)

The setup is identical for kind, minikube, and k3s:

```bash
# 1. Build and load image (choose your platform)
docker build -t s3-manager:dev .

# For kind:
kind load docker-image s3-manager:dev

# For minikube:
minikube image load s3-manager:dev

# For k3s:
docker save s3-manager:dev | sudo k3s ctr images import -

# 2. Deploy LocalStack (creates namespace, PVC, and deployment)
kubectl apply -f k8s-helm-local/localstack.yaml

# 3. Wait for LocalStack to be ready
kubectl wait --for=condition=ready pod -l app=localstack -n s3-manager --timeout=120s

# 4. Install S3 Manager with Helm
helm install s3-manager ./helm/s3-manager \
  -f k8s-helm-local/values-local.yaml \
  -n s3-manager

# 5. Access the application
kubectl port-forward -n s3-manager svc/s3-manager 8080:80
```

Visit http://localhost:8080

### Data Persistence

LocalStack now uses a **PersistentVolumeClaim** by default:
- Data persists across pod restarts
- 5Gi storage allocated automatically
- Works with all local clusters (kind, minikube, k3s)

To check PVC status:
```bash
kubectl get pvc -n s3-manager
```

### Platform-Specific Notes

All platforms work the same way. The only difference is how you start the cluster and load images:

**kind:**
```bash
kind create cluster
kind load docker-image s3-manager:dev
```

**minikube:**
```bash
minikube start
minikube image load s3-manager:dev

# Optional: Enable ingress
minikube addons enable ingress
```

**k3s:**
```bash
# k3s is usually already running
docker save s3-manager:dev | sudo k3s ctr images import -
```

For detailed platform-specific instructions, see [k8s-helm-local/README.md](../../k8s-helm-local/README.md).

### Accessing the Application

**Port Forward (All Platforms):**
```bash
kubectl port-forward -n s3-manager svc/s3-manager 8080:80
```
Access at http://localhost:8080

**Ingress (minikube):**
```bash
minikube tunnel
# Add to /etc/hosts: 127.0.0.1 s3-manager.local
```
Access at http://s3-manager.local

**NodePort (Any Platform):**
```bash
kubectl patch svc s3-manager -n s3-manager -p '{"spec":{"type":"NodePort"}}'
kubectl get svc s3-manager -n s3-manager
```

## Environment Variables Reference

### Local Development Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_DEV_MODE` | `false` | Enables mock authentication (bypasses Azure AD) |
| `FLASK_DEBUG` | `false` | Enables Flask debug mode with hot reload |
| `DEFAULT_ROLE` | `S3-Viewer` | Default role assigned to mock user in dev mode |

### S3 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | `http://rook-ceph-rgw:8080` | S3 endpoint URL |
| `S3_ACCESS_KEY` | - | S3 access key |
| `S3_SECRET_KEY` | - | S3 secret key |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_USE_SSL` | `false` | Use SSL for S3 connections |
| `S3_VERIFY_SSL` | `false` | Verify SSL certificates |

## Testing S3 Operations

### Using AWS CLI with LocalStack

```bash
# Configure AWS CLI for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Or use awslocal wrapper
pip install awscli-local

# List buckets
awslocal s3 ls

# Upload file
awslocal s3 cp myfile.txt s3://demo-bucket/

# Download file
awslocal s3 cp s3://demo-bucket/myfile.txt ./downloaded.txt

# List objects
awslocal s3 ls s3://demo-bucket/
```

### Using boto3 Python Script

```python
import boto3

s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:4566',
    aws_access_key_id='test',
    aws_secret_access_key='test',
    region_name='us-east-1'
)

# List buckets
buckets = s3.list_buckets()
print(buckets)

# Upload file
s3.upload_file('local-file.txt', 'demo-bucket', 'remote-file.txt')
```

## Container Runtime Details

### Supported Runtimes

S3 Manager supports multiple OCI-compliant container runtimes:
- ✅ **Docker** (20.10+) - Traditional container runtime
- ✅ **Podman** (4.0+) - Daemonless, rootless-capable alternative
- ✅ **Other OCI runtimes** - Any compatible runtime

### Docker vs Podman

| Feature | Docker | Podman |
|---------|--------|--------|
| **Daemon** | Required | Not required (daemonless) |
| **Root Access** | Usually required | Rootless mode available |
| **Systemd Integration** | Via Docker service | Native unit generation |
| **Security** | Good | Enhanced (rootless) |
| **Compatibility** | OCI compliant | OCI compliant + Docker compatible |
| **Image Format** | OCI | OCI |

### Podman-Specific Features

#### Rootless Mode (Linux)

Run containers without root privileges:
```bash
# Check if running rootless
podman info | grep rootless
# Should show: rootless: true

# No sudo needed
podman compose up
```

#### Systemd Integration

Generate and install systemd services:
```bash
# Generate systemd unit files
make podman-generate-systemd

# Install as system services
make podman-install-systemd

# Enable and start
sudo systemctl enable --now s3-manager-app
sudo systemctl enable --now s3-manager-localstack

# Check status
systemctl status s3-manager-app
```

#### SELinux Compatibility

Volume mounts automatically include `:Z` flag for SELinux:
```yaml
volumes:
  - ./app:/app/app:Z  # Relabels for container access
```

### BuildKit Support

Both Docker and Podman support BuildKit for faster builds:

#### Enabling BuildKit

**Docker:**
```bash
# Temporarily
export DOCKER_BUILDKIT=1
docker build -t s3-manager:latest .

# Permanently - add to ~/.bashrc or ~/.zshrc
export DOCKER_BUILDKIT=1

# Or use buildx (recommended)
docker buildx build -t s3-manager:latest .
```

**Podman:**
```bash
# BuildKit features work automatically in Podman 4.0+
podman build -t s3-manager:latest .
```

#### BuildKit Benefits

- ✅ **Faster builds** - Parallel build stages
- ✅ **Better caching** - Cache mounts for pip packages
- ✅ **Smaller images** - Optimized multi-stage builds
- ✅ **Security** - Isolated build containers

#### Build Commands

```bash
# Production image
make build                                    # Auto-detects runtime
docker buildx build -t s3-manager:latest .    # Docker with buildx
podman build -t s3-manager:latest .           # Podman

# Development image
docker build -f Dockerfile.dev -t s3-manager:dev .
podman build -f Dockerfile.dev -t s3-manager:dev .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t s3-manager:latest .
podman build --platform linux/amd64,linux/arm64 -t s3-manager:latest .
```

### Runtime Selection

The project automatically detects your container runtime:

**Auto-detection order:**
1. Check for `podman` command
2. Check for `docker` command
3. Select appropriate compose command (`podman compose` or `docker-compose`)
4. Choose correct compose file

**Manual override:**
```bash
# Force Docker
CONTAINER_RUNTIME=docker make start

# Force Podman
CONTAINER_RUNTIME=podman make start
```

### Migration Between Runtimes

**From Docker to Podman:**
```bash
# 1. Install Podman
# 2. Stop Docker containers
docker-compose down

# 3. Start with Podman (auto-detected)
make start
```

**From Podman to Docker:**
```bash
# 1. Install Docker
# 2. Stop Podman containers
podman compose down

# 3. Start with Docker (auto-detected)
make start
```

No configuration changes needed!

## Troubleshooting

### LocalStack "Device or resource busy" error

**Issue**: LocalStack fails to start with:
```
ERROR: 'rm -rf "/tmp/localstack"': exit code 1
OSError: [Errno 16] Device or resource busy: '/tmp/localstack'
```

**Cause**: Volume mount conflict on `/tmp/localstack` directory.

**Solution**: This is already fixed in the current compose files. They now mount to `/var/lib/localstack` instead. If you're still seeing this:

```bash
# Pull the latest changes and restart
docker-compose down -v
docker-compose up

# Or for Podman
podman compose down -v
podman compose up

# For Kubernetes (kind/minikube/k3s)
kubectl delete -f k8s-local/localstack.yaml
kubectl apply -f k8s-helm-local/localstack.yaml
```

**Note**: The current configuration uses `PERSISTENCE=1` and mounts to `/var/lib/localstack` to avoid this issue.

### Application won't start

**Issue**: Port 8080 already in use
```bash
# Find process using port
# Windows
netstat -ano | findstr :8080
# macOS/Linux
lsof -i :8080

# Kill process or use different port
docker-compose up
```

### Can't connect to S3/LocalStack

**Issue**: Connection refused to LocalStack
```bash
# Check if LocalStack is running
docker ps | grep localstack

# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Restart LocalStack
docker-compose restart localstack
```

### Authentication not working

**Issue**: Mock user not created in local dev mode
```bash
# Verify LOCAL_DEV_MODE is set to true
echo $LOCAL_DEV_MODE  # Should print "true"

# Check application logs
docker-compose logs s3-manager

# Restart application
docker-compose restart s3-manager
```

### Changes not reflecting

**Issue**: Code changes not showing up
```bash
# For Docker Compose: ensure volumes are mounted
docker-compose down
docker-compose up

# For direct Python: restart the app
# Press Ctrl+C and run `python run.py` again
```

## Tips for Development

1. **Use hot reload**: Both Docker Compose and Flask debug mode support hot reload
2. **Check logs**: `docker-compose logs -f s3-manager` for real-time logs
3. **Reset data**: `docker-compose down -v` removes all LocalStack data
4. **Test different roles**: Modify `DEFAULT_ROLE` in `.env.local`
5. **Debug S3 operations**: Use `FLASK_DEBUG=true` for detailed error messages

## Production vs Development

| Feature | Development | Production |
|---------|------------|------------|
| Authentication | Mock (LOCAL_DEV_MODE) | Azure AD OAuth2 |
| S3 Service | LocalStack | Rook-Ceph RGW |
| SSL/TLS | Disabled | Required |
| Debug Mode | Enabled | Disabled |
| Permissions | All (S3-Admin) | Role-based |

## Next Steps

- Read [configuration.md](configuration.md) for advanced configuration options
- Read [../deployment/kubernetes.md](../deployment/kubernetes.md) for production deployment guide
- Check [../../README.md](../../README.md) for general project information
