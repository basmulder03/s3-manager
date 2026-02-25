# Local Kubernetes Setup with kind

This guide explains how to set up the S3 Manager application on a local kind cluster with NodePort access.

## Prerequisites

- Docker Desktop installed and running
- `kind` CLI installed ([installation guide](https://kind.sigs.k8s.io/docs/user/quick-start/#installation))
- `kubectl` CLI installed
- S3 Manager Docker image built: `docker build -t s3-manager:dev .`

## Why NodePort Doesn't Work by Default

kind clusters run inside Docker containers. By default, NodePort services (ports 30000-32767) are only accessible inside the Docker network, not from your host machine.

To access NodePort services from `localhost`, you need to configure **extraPortMappings** when creating the kind cluster.

## Setup Instructions

### Step 1: Delete Existing Cluster (If Needed)

If you already have a kind cluster:

```bash
kind delete cluster --name kind-cluster
```

### Step 2: Create Cluster with Port Mappings

The `kind-config.yaml` file is already configured with the required port mappings:

```bash
kind create cluster --name kind-cluster --config k8s/local/kind-config.yaml
```

This creates a cluster that maps:
- Container port 30080 → localhost:30080 (S3 Manager)
- Container port 30081 → localhost:30081 (Keycloak)
- Container port 30082 → localhost:30082 (LocalStack)

### Step 3: Load Docker Image into kind

```bash
kind load docker-image s3-manager:dev --name kind-cluster
```

### Step 4: Install Envoy Gateway

```bash
kubectl apply -f https://github.com/envoyproxy/gateway/releases/download/v1.3.0/install.yaml
```

Wait for Envoy Gateway to be ready:

```bash
kubectl wait --for=condition=available deployment/envoy-gateway -n envoy-gateway-system --timeout=180s
```

### Step 5: Deploy All Services

```bash
kubectl apply -k k8s/local/
```

### Step 6: Wait for Pods to be Ready

```bash
# Wait for all pods to be running
kubectl wait --for=condition=ready pod -l app=keycloak -n keycloak --timeout=180s
kubectl wait --for=condition=ready pod -l app=localstack -n localstack --timeout=180s
kubectl wait --for=condition=ready pod -l app=s3-manager -n s3-manager-test --timeout=180s
```

### Step 7: Verify Services

Check that all pods are running:

```bash
kubectl get pods -A | grep -E "(s3-manager|keycloak|localstack|envoy)"
```

Test NodePort access:

```bash
curl http://localhost:30080/health    # S3 Manager
curl http://localhost:30081           # Keycloak
curl http://localhost:30082/_localstack/health  # LocalStack
```

## Access Your Services

Once deployed, access the services at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **S3 Manager** | http://localhost:30080 | Via Keycloak OIDC |
| **Keycloak Admin** | http://localhost:30081/admin | admin / admin |
| **LocalStack S3** | http://localhost:30082 | test / test |

## Alternative: Port-Forwarding (Without Cluster Recreation)

If you don't want to recreate your cluster, use port-forwarding instead:

```bash
# Terminal 1 - S3 Manager
kubectl port-forward -n s3-manager-test svc/s3-manager 9080:80

# Terminal 2 - Keycloak
kubectl port-forward -n keycloak svc/keycloak 9081:80

# Terminal 3 - LocalStack
kubectl port-forward -n localstack svc/localstack 9082:4566
```

Then access:
- S3 Manager: http://localhost:9080
- Keycloak: http://localhost:9081
- LocalStack: http://localhost:9082

## Configuration Files

All configuration is in YAML files:

- **`kind-config.yaml`** - kind cluster configuration with port mappings
- **`keycloak/`** - Keycloak deployment with pre-configured realm
- **`localstack/`** - LocalStack S3 service deployment
  - `deployment.yaml` - LocalStack pod configuration
  - `service.yaml` - ClusterIP service
  - `nodeport-service.yaml` - NodePort service on port 30081
- **`test-deployment/`** - S3 Manager application
  - `s3-manager-test.yaml` - Main deployment
  - `nodeport-service.yaml` - NodePort service on port 30080
- **`envoy-gateway/`** - Gateway configuration and HTTPRoutes

## Testing the Setup

### Test LocalStack S3

```bash
# Create a test bucket
aws --endpoint-url=http://localhost:30082 s3 mb s3://test-bucket

# List buckets
aws --endpoint-url=http://localhost:30082 s3 ls

# Upload a file
echo "Hello from LocalStack" > test.txt
aws --endpoint-url=http://localhost:30082 s3 cp test.txt s3://test-bucket/
```

### Test Keycloak

Open http://localhost:30081/admin in your browser:
- Username: `admin`
- Password: `admin`

Navigate to the `s3-manager` realm to see the configured client.

### Test S3 Manager

Open http://localhost:30080 in your browser. You should be redirected to Keycloak for authentication.

## Troubleshooting

### Pods not starting

Check pod status and logs:

```bash
kubectl get pods -A
kubectl logs -n s3-manager-test -l app=s3-manager --tail=50
kubectl logs -n keycloak -l app=keycloak --tail=50
kubectl logs -n localstack -l app=localstack --tail=50
```

### NodePort not accessible

Verify the kind cluster has port mappings:

```bash
docker ps --filter "name=kind-cluster-control-plane"
```

Look for port mappings like `0.0.0.0:30080->30080/tcp` in the PORTS column.

If missing, your cluster wasn't created with `kind-config.yaml`. Recreate it following Step 2.

### After laptop sleep

kind clusters sometimes need Docker Desktop to be restarted after sleep:

1. Restart Docker Desktop
2. Wait 30 seconds
3. Test again: `kubectl get nodes`

If nodes are not ready, restart the cluster:

```bash
kind delete cluster --name kind-cluster
# Then follow setup steps again
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              kind Cluster (Docker)              │
│                                                 │
│  ┌──────────────┐     Port Mapping             │
│  │  S3 Manager  │ ← 30080:80 → localhost:30080  │
│  └──────┬───────┘                               │
│         │                                       │
│         ├─→ Keycloak ← 30081:80 → localhost:30081
│         │                                       │
│         └─→ LocalStack ← 30082:4566 → localhost:30082
│                                                 │
└─────────────────────────────────────────────────┘
```

## Production Deployment

For production deployments, see:
- `../../helm/s3-manager/` - Helm chart for production
- Production setup uses Ingress instead of NodePort
- Proper SSL/TLS certificates required
- External authentication provider (not dev Keycloak)
