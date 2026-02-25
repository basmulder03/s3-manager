# Local Kubernetes Development Setup

This directory contains Kubernetes manifests and Helm values for running S3 Manager in a local Kubernetes cluster.

## Files

- `localstack.yaml` - Deploys LocalStack S3 service to the cluster
- `values-local.yaml` - Helm values for local development
- `README.md` - This file

## Quick Start

### 1. Prerequisites

- Local Kubernetes cluster (minikube, kind, or k3s)
- kubectl configured
- Helm 3.x
- Docker

### 2. Build and Load Image

#### For minikube:
```bash
# Build the image
docker build -t s3-manager:dev -f Dockerfile .

# Load into minikube
minikube image load s3-manager:dev
```

#### For kind:
```bash
# Build the image
docker build -t s3-manager:dev -f Dockerfile .

# Load into kind
kind load docker-image s3-manager:dev
```

#### For k3s:
```bash
# Build the image
docker build -t s3-manager:dev -f Dockerfile .

# Import into k3s
docker save s3-manager:dev | sudo k3s ctr images import -
```

### 3. Deploy LocalStack

```bash
# Create namespace
kubectl create namespace s3-manager

# Deploy LocalStack
kubectl apply -f k8s-local/localstack.yaml

# Wait for LocalStack to be ready
kubectl wait --for=condition=ready pod -l app=localstack -n s3-manager --timeout=60s
```

### 4. Deploy S3 Manager

```bash
# Install with Helm using local values
helm install s3-manager ./helm/s3-manager \
  -f k8s-local/values-local.yaml \
  -n s3-manager

# Check deployment status
kubectl get pods -n s3-manager
```

### 5. Access the Application

#### Option A: Port Forward
```bash
kubectl port-forward -n s3-manager svc/s3-manager 8080:80
```
Access at http://localhost:8080

#### Option B: Ingress (minikube)
```bash
# Enable ingress addon
minikube addons enable ingress

# Add to /etc/hosts (or C:\Windows\System32\drivers\etc\hosts on Windows)
echo "$(minikube ip) s3-manager.local" | sudo tee -a /etc/hosts

# Start tunnel
minikube tunnel
```
Access at http://s3-manager.local

#### Option C: NodePort (any cluster)
```bash
# Edit service to NodePort
kubectl patch svc s3-manager -n s3-manager -p '{"spec":{"type":"NodePort"}}'

# Get the NodePort
kubectl get svc s3-manager -n s3-manager

# Access (for minikube)
minikube service s3-manager -n s3-manager
```

## Development Workflow

### Update Application Code

```bash
# 1. Make code changes
# 2. Rebuild image
docker build -t s3-manager:dev -f Dockerfile .

# 3. Reload image to cluster
# For minikube:
minikube image load s3-manager:dev
# For kind:
kind load docker-image s3-manager:dev
# For k3s:
docker save s3-manager:dev | sudo k3s ctr images import -

# 4. Restart deployment
kubectl rollout restart deployment/s3-manager -n s3-manager

# 5. Watch rollout
kubectl rollout status deployment/s3-manager -n s3-manager
```

### View Logs

```bash
# S3 Manager logs
kubectl logs -f -l app.kubernetes.io/name=s3-manager -n s3-manager

# LocalStack logs
kubectl logs -f -l app=localstack -n s3-manager

# All logs
kubectl logs -f --all-containers=true -n s3-manager
```

### Test S3 Operations

```bash
# Port forward LocalStack
kubectl port-forward -n s3-manager svc/localstack 4566:4566

# In another terminal, use AWS CLI
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# List buckets
aws s3 ls --endpoint-url http://localhost:4566

# Upload file
aws s3 cp myfile.txt s3://demo-bucket/ --endpoint-url http://localhost:4566

# Download file
aws s3 cp s3://demo-bucket/myfile.txt downloaded.txt --endpoint-url http://localhost:4566
```

### Debug Pod

```bash
# Get shell in S3 Manager pod
kubectl exec -it -n s3-manager deployment/s3-manager -- /bin/sh

# Test S3 connectivity from pod
kubectl exec -it -n s3-manager deployment/s3-manager -- \
  python -c "import boto3; s3=boto3.client('s3', endpoint_url='http://localstack:4566', aws_access_key_id='test', aws_secret_access_key='test'); print(s3.list_buckets())"
```

## Cleanup

```bash
# Uninstall S3 Manager
helm uninstall s3-manager -n s3-manager

# Delete LocalStack
kubectl delete -f k8s-local/localstack.yaml

# Delete namespace (removes everything)
kubectl delete namespace s3-manager
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl get pods -n s3-manager

# Describe pod for events
kubectl describe pod -l app.kubernetes.io/name=s3-manager -n s3-manager

# Check logs
kubectl logs -l app.kubernetes.io/name=s3-manager -n s3-manager
```

### Image pull errors

If you see `ImagePullBackOff`:
```bash
# Verify image is loaded
# For minikube:
minikube image ls | grep s3-manager

# For kind:
docker exec -it kind-control-plane crictl images | grep s3-manager

# Ensure pullPolicy is Never in values-local.yaml
```

### Can't access LocalStack from S3 Manager

```bash
# Check service exists
kubectl get svc localstack -n s3-manager

# Test connectivity
kubectl exec -it deployment/s3-manager -n s3-manager -- \
  curl http://localstack:4566/_localstack/health

# Check LocalStack logs
kubectl logs -l app=localstack -n s3-manager
```

### Ingress not working

```bash
# Check ingress status
kubectl get ingress -n s3-manager

# Verify ingress controller is running
kubectl get pods -A | grep ingress

# Check ingress events
kubectl describe ingress s3-manager -n s3-manager
```

## Configuration

All configuration is in `values-local.yaml`. Key settings:

- `config.localDevMode: true` - Enables mock authentication
- `config.s3.endpoint` - Points to LocalStack service
- `image.pullPolicy: Never` - Uses local image
- `config.defaultRole: S3-Admin` - Grants all permissions

To modify permissions, edit the `rolePermissions` section in `values-local.yaml`.

## Tips

1. **Use stern for better logs**: `stern s3-manager -n s3-manager`
2. **Watch resources**: `watch kubectl get all -n s3-manager`
3. **Quick restart**: `kubectl rollout restart deployment/s3-manager -n s3-manager`
4. **Reset data**: `kubectl delete pod -l app=localstack -n s3-manager` (recreates pod with fresh data)
5. **Check resource usage**: `kubectl top pods -n s3-manager`
