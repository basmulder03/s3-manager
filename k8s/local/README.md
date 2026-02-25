# Local Kubernetes Setup with kind

This guide explains how to set up the S3 Manager application on a local kind cluster.

## Prerequisites

- Docker Desktop installed and running
- `kind` CLI installed ([installation guide](https://kind.sigs.k8s.io/docs/user/quick-start/#installation))
- `kubectl` CLI installed
- S3 Manager Docker image built: `docker build -t s3-manager:dev .`

## Setup Instructions

### Step 1: Create kind Cluster (If Needed)

If you don't have a kind cluster yet:

```bash
kind create cluster --name kind-cluster
```

### Step 2: Load Docker Image into kind

```bash
kind load docker-image s3-manager:dev --name kind-cluster
```

### Step 3: Install Envoy Gateway

```bash
kubectl apply -f https://github.com/envoyproxy/gateway/releases/download/v1.3.0/install.yaml
```

Wait for Envoy Gateway to be ready:

```bash
kubectl wait --for=condition=available deployment/envoy-gateway -n envoy-gateway-system --timeout=180s
```

### Step 4: Deploy All Services

```bash
kubectl apply -k k8s/local/
```

### Step 5: Wait for Pods to be Ready

```bash
# Wait for all pods to be running
kubectl wait --for=condition=ready pod -l app=keycloak -n keycloak --timeout=180s
kubectl wait --for=condition=ready pod -l app=localstack -n localstack --timeout=180s
kubectl wait --for=condition=ready pod -l app=s3-manager -n s3-manager-test --timeout=180s
```

### Step 6: Access Services via Port-Forwarding

Open three separate terminal windows and run these commands:

```bash
# Terminal 1 - S3 Manager
kubectl port-forward -n s3-manager-test svc/s3-manager 9080:80

# Terminal 2 - Keycloak
kubectl port-forward -n keycloak svc/keycloak 9081:80

# Terminal 3 - LocalStack
kubectl port-forward -n localstack svc/localstack 9082:4566
```

### Step 7: Verify Services

Check that all pods are running:

```bash
kubectl get pods -A | grep -E "(s3-manager|keycloak|localstack|envoy)"
```

Test service access via port-forwarding (in separate terminals):

```bash
curl http://localhost:9080/health    # S3 Manager
curl http://localhost:9081           # Keycloak
curl http://localhost:9082/_localstack/health  # LocalStack
```

## Access Your Services

Once deployed and port-forwarding is running, access the services at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **S3 Manager** | http://localhost:9080 | Via Keycloak OIDC |
| **Keycloak Admin** | http://localhost:9081/admin | admin / admin |
| **LocalStack S3** | http://localhost:9082 | test / test |

## Configuration Files

All configuration is in YAML files:

- **`keycloak/`** - Keycloak deployment with pre-configured realm
- **`localstack/`** - LocalStack S3 service deployment
  - `deployment.yaml` - LocalStack pod configuration
  - `service.yaml` - ClusterIP service
- **`test-deployment/`** - S3 Manager application
  - `s3-manager-test.yaml` - Main deployment
  - `service.yaml` - ClusterIP service
- **`envoy-gateway/`** - Gateway configuration and HTTPRoutes

## Testing the Setup

### Test LocalStack S3

```bash
# Create a test bucket
aws --endpoint-url=http://localhost:9082 s3 mb s3://test-bucket

# List buckets
aws --endpoint-url=http://localhost:9082 s3 ls

# Upload a file
echo "Hello from LocalStack" > test.txt
aws --endpoint-url=http://localhost:9082 s3 cp test.txt s3://test-bucket/
```

### Test Keycloak

Open http://localhost:9081/admin in your browser:
- Username: `admin`
- Password: `admin`

Navigate to the `s3-manager` realm to see the configured client.

### Test S3 Manager

Open http://localhost:9080 in your browser. You should be redirected to Keycloak for authentication.

## Troubleshooting

### Pods not starting

Check pod status and logs:

```bash
kubectl get pods -A
kubectl logs -n s3-manager-test -l app=s3-manager --tail=50
kubectl logs -n keycloak -l app=keycloak --tail=50
kubectl logs -n localstack -l app=localstack --tail=50
```

### Port-forwarding disconnects

If port-forwarding drops (common after laptop sleep), just restart the port-forward commands:

```bash
kubectl port-forward -n s3-manager-test svc/s3-manager 9080:80
kubectl port-forward -n keycloak svc/keycloak 9081:80
kubectl port-forward -n localstack svc/localstack 9082:4566
```

### After laptop sleep

kind clusters sometimes need Docker Desktop to be restarted after sleep:

1. Restart Docker Desktop
2. Wait 30 seconds
3. Test again: `kubectl get nodes`
4. Restart your port-forward commands if needed

## Architecture

```
┌─────────────────────────────────────────────────┐
│              kind Cluster (Docker)              │
│                                                 │
│  ┌──────────────┐     Port Forward             │
│  │  S3 Manager  │ ← :80 → localhost:9080        │
│  └──────┬───────┘                               │
│         │                                       │
│         ├─→ Keycloak ← :80 → localhost:9081     │
│         │                                       │
│         └─→ LocalStack ← :4566 → localhost:9082 │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Production Deployment

For production deployments, see:
- `../../helm/s3-manager/` - Helm chart for production
- Production setup uses Ingress instead of NodePort
- Proper SSL/TLS certificates required
- External authentication provider (not dev Keycloak)
