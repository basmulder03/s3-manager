# Local Kubernetes Deployment

This directory contains ready-to-deploy Kubernetes manifests for testing S3 Manager locally with Envoy Gateway, Keycloak, and Rook-Ceph S3 storage.

## Overview

The deployment includes:
- **Envoy Gateway** - Modern Gateway API controller with native OIDC support
- **Keycloak** - OIDC authentication provider with pre-configured realm
- **Rook-Ceph v1.19** - Manages Ceph clusters in Kubernetes
- **Ceph v19.2** - Minimal cluster for testing (Reef release)
- **Object Store (RGW)** - S3-compatible RADOS Gateway
- **Object Store User** - S3 credentials for S3 Manager
- **S3 Manager** - Application with gateway-level OIDC and Rook-Ceph storage

## Directory Structure

```
k8s/local/
├── kustomization.yaml          # Root kustomization - deploy everything
├── envoy-gateway/
│   ├── kustomization.yaml      # Envoy Gateway deployment
│   ├── namespace.yaml          # envoy-gateway-system namespace
│   ├── install.yaml            # Envoy Gateway controller
│   └── gateway.yaml            # Gateway and GatewayClass resources
├── keycloak/
│   ├── kustomization.yaml      # Keycloak deployment
│   └── keycloak-local.yaml     # Keycloak with pre-configured realm
├── rook-ceph/
│   ├── kustomization.yaml      # Rook-Ceph deployment (references external manifests)
│   ├── cluster.yaml            # Ceph cluster configuration
│   ├── object-store.yaml       # S3 gateway (RGW) configuration
│   └── object-store-user.yaml  # S3 user and credentials
└── test-deployment/
    ├── kustomization.yaml      # S3 Manager deployment
    └── s3-manager-test.yaml    # S3 Manager test deployment
```

> **Note**: Rook-Ceph CRDs, common resources, and operator are referenced from the official Rook repository, not stored in this repo.

## Prerequisites

- **Kubernetes cluster (1.26+)** - minikube, kind, k3d, or any cluster
- **kubectl** configured and connected
- **Clean cluster** - No previous Rook-Ceph or S3 Manager deployments
- **Resources**: 8GB+ RAM, 4+ CPU cores available
- **Single-node cluster supported** - The configuration allows multiple Ceph components per node

> **Important for Single-Node Clusters**: This configuration sets `allowMultiplePerNode: true` for Ceph monitors and managers, making it suitable for single-node development clusters (minikube, kind, k3d).

## Important Notes

### Before Deployment

1. **Clean cluster required**: If you have old deployments, clean them up first:
   ```bash
   # Check for old namespaces
   kubectl get ns | grep -E 'rook-ceph|s3-manager|keycloak|envoy-gateway'
   
   # If they exist, clean them up (see Cleanup section below)
   ```

2. **CRDs must be applied first**: Rook-Ceph CRDs must exist before deploying the operator

3. **Wait for each component**: Don't rush - Ceph especially takes 5-10 minutes to become healthy

## Quick Start

### Fresh Deployment (Recommended)

If you have old deployments, clean them up first:

```bash
# Clean up old deployments (if any)
kubectl delete -k k8s/local/
kubectl delete namespace s3-manager  # Old namespace (if exists)
kubectl delete -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# Wait for all resources to be deleted
kubectl get ns | grep -E 'rook-ceph|s3-manager|keycloak|envoy-gateway'
```

Deploy the entire stack:

```bash
# 1. Install Rook CRDs first (REQUIRED - must be done before deploying Rook-Ceph)
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# 2. Deploy everything (Envoy Gateway, Keycloak, Rook-Ceph, S3 Manager)
kubectl apply -k k8s/local/

# Or deploy step-by-step:
kubectl apply -k k8s/local/envoy-gateway/      # 1. Envoy Gateway
kubectl apply -k k8s/local/keycloak/           # 2. Keycloak
kubectl apply -k k8s/local/rook-ceph/          # 3. Rook-Ceph (after CRDs!)
kubectl apply -k k8s/local/test-deployment/    # 4. S3 Manager
```

**Important:** Rook-Ceph CRDs must be installed before deploying the Rook operator.

### Check Deployment Status

Use the status check scripts to monitor your deployment:

```bash
# Linux/macOS
./k8s/local/check-status.sh

# Windows
.\k8s\local\check-status.ps1
```

### Verify Deployment

```bash
# Check all namespaces
kubectl get ns

# Check Envoy Gateway
kubectl -n envoy-gateway-system get pods,gateway

# Check Keycloak
kubectl -n keycloak get pods,svc

# Check Rook-Ceph
kubectl -n rook-ceph get cephcluster,pods

# Check S3 Manager  
kubectl -n s3-manager-test get pods,svc
```

### Access Applications

**Option 1: Port Forwarding (Quick Testing)**

```bash
# Access S3 Manager
kubectl -n s3-manager-test port-forward svc/s3-manager 8080:80
# Open: http://localhost:8080

# Access Keycloak Admin
kubectl -n keycloak port-forward svc/keycloak 8081:8080  
# Open: http://localhost:8081
# Login: admin / admin
```

**Option 2: Via Hostnames (Recommended)**

Add to `/etc/hosts` (Linux/macOS) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
<cluster-ip>  s3-manager.local
<cluster-ip>  keycloak.local
```

Get cluster IP:
- **minikube**: `minikube ip`
- **kind/k3d**: Use `127.0.0.1`
- **Other clusters**: Get LoadBalancer or NodePort IP

Then access:
- **S3 Manager**: http://s3-manager.local
- **Keycloak Admin**: http://keycloak.local

**Test Users**:
- `admin/admin123` - Full access (view, write, delete)
- `editor/editor123` - View + write access
- `viewer/viewer123` - View only access

## Step-by-Step Deployment

If you prefer to deploy components individually:

### 1. Install Rook-Ceph CRDs (Required)

```bash
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
kubectl get crd | grep ceph  # Verify CRDs installed
```

### 2. Deploy Envoy Gateway

```bash
kubectl apply -k k8s/local/envoy-gateway/

# Wait for controller to be ready
kubectl -n envoy-gateway-system wait --for=condition=ready pod -l control-plane=envoy-gateway --timeout=120s

# Verify Gateway is Programmed
kubectl -n envoy-gateway-system get gateway eg
```

### 3. Deploy Keycloak

```bash
kubectl apply -k k8s/local/keycloak/

# Wait for Keycloak to be ready
kubectl -n keycloak wait --for=condition=available deployment/keycloak --timeout=300s

# Check Keycloak is running
kubectl -n keycloak get pods
```

### 4. Deploy Rook-Ceph

```bash
kubectl apply -k k8s/local/rook-ceph/

# Wait for operator (this is fast)
kubectl -n rook-ceph wait --for=condition=ready pod -l app=rook-ceph-operator --timeout=120s

# Wait for Ceph cluster (this takes 5-10 minutes)
kubectl -n rook-ceph get cephcluster -w  # Watch until HEALTH_OK

# Wait for object store
kubectl -n rook-ceph wait --for=condition=ready cephobjectstore/s3-store --timeout=300s
```

### 5. Deploy S3 Manager

```bash
kubectl apply -k k8s/local/test-deployment/

# Wait for deployment
kubectl -n s3-manager-test wait --for=condition=available deployment/s3-manager --timeout=120s

# Check application is running
kubectl -n s3-manager-test get pods
```

## Verification

### Check Envoy Gateway

```bash
# Gateway status
kubectl -n envoy-gateway-system get gateway

# Gateway should show Programmed=True
kubectl -n envoy-gateway-system describe gateway eg

# Check HTTPRoutes
kubectl get httproute -A
```

### Check Keycloak

```bash
# Keycloak pod status
kubectl -n keycloak get pods

# Access Keycloak admin console
kubectl -n keycloak port-forward svc/keycloak 8081:8080
# Open: http://localhost:8081 (admin/admin)
```

### Check Rook-Ceph Health

```bash
# Overall cluster health
kubectl -n rook-ceph get cephcluster

# Detailed status
kubectl -n rook-ceph describe cephcluster rook-ceph

# Check all Ceph pods
kubectl -n rook-ceph get pods

# Expected pods:
# - rook-ceph-operator-*
# - rook-ceph-mon-* (3 monitors)
# - rook-ceph-mgr-* (2 managers)
# - rook-ceph-osd-* (depends on available disks)
# - rook-ceph-rgw-s3-store-* (2 RGW instances)
```

### Test S3 Access Directly

```bash
# Run a test pod with AWS CLI
kubectl run -it --rm aws-cli --image=amazon/aws-cli --restart=Never -- bash

# Inside the pod, configure AWS CLI:
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_DEFAULT_REGION=us-east-1

# List buckets
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 ls

# Create a test bucket
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 mb s3://test-bucket

# Upload a file
echo "test" > test.txt
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 cp test.txt s3://test-bucket/

# List files
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 ls s3://test-bucket/
```

### Test S3 Manager Functionality

1. **Access the UI** (via port-forward or ingress)
2. **Login** - In dev mode, you'll be auto-logged in as "Local Developer"
3. **View buckets** - You should see "test-bucket" created by the init job
4. **Upload files** - Test uploading files through the UI
5. **Download files** - Test downloading the test file
6. **Delete files** - Test deletion (if you have admin permissions)

## Troubleshooting

### Common Deployment Errors

**Error: "serviceaccount not found" for CSI components**

This means the Rook common resources weren't applied or weren't in the right namespace.

```bash
# Recreate if needed
kubectl delete -f k8s/local/rook-ceph/object-store-user.yaml
kubectl apply -f k8s/local/rook-ceph/object-store-user.yaml
```

**Error: "cannot start 3 mons on 1 node(s) when allowMultiplePerNode is false"**

You're running on a single-node cluster but the configuration didn't allow multiple components per node.

```bash
# Solution: Already fixed in cluster.yaml (allowMultiplePerNode: true)
# Delete the cluster and reapply
kubectl -n rook-ceph delete cephcluster rook-ceph
kubectl apply -k k8s/local/rook-ceph/
```

**Error: "secret rook-ceph-object-user-s3-store-s3-manager not found"**

The object store user hasn't been created yet. Ceph must be healthy first.

```bash
# Check Ceph cluster health
kubectl -n rook-ceph get cephcluster

# Wait for HEALTH_OK status (can take 5-10 minutes)
kubectl -n rook-ceph get cephcluster -w

# Once healthy, the secret will be created automatically
kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager
```

**Error: Pods from old deployments still exist**

Old resources from previous deployments are interfering.

```bash
# Clean up old deployments
kubectl delete namespace s3-manager  # Old namespace (if exists)
kubectl delete -k k8s/local/

# Wait for all resources to be deleted
kubectl get ns

# Then redeploy
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
kubectl apply -k k8s/local/
```

### Rook-Ceph Cluster Issues

**Problem: Cluster stuck in "Progressing" state**

```bash
# Check operator logs
kubectl -n rook-ceph logs -l app=rook-ceph-operator -f

# Check for OSD preparation issues
kubectl -n rook-ceph get pods | grep prepare

# View events
kubectl -n rook-ceph get events --sort-by='.lastTimestamp'
```

**Problem: No OSDs created**

```bash
# Check if devices are available
kubectl -n rook-ceph exec -it deployment/rook-ceph-tools -- bash
# Inside toolbox:
ceph osd tree
lsblk

# Edit cluster.yaml to use useAllDevices: true for testing
```

**Problem: Health status HEALTH_WARN**

```bash
# Check Ceph status
kubectl -n rook-ceph exec -it deployment/rook-ceph-tools -- ceph status
kubectl -n rook-ceph exec -it deployment/rook-ceph-tools -- ceph health detail

# Common warnings during initial setup:
# - "too few PGs per OSD" - expected, will auto-balance
# - "clock skew detected" - sync time on nodes
```

### Object Store Issues

**Problem: RGW pods not starting**

```bash
# Check object store status
kubectl -n rook-ceph describe cephobjectstore s3-store

# Check RGW pod logs
kubectl -n rook-ceph logs -l app=rook-ceph-rgw -f

# Verify cluster is healthy first
kubectl -n rook-ceph get cephcluster
```

**Problem: Cannot access S3 endpoint**

```bash
# Test connectivity from inside cluster
kubectl run -it --rm test-curl --image=curlimages/curl --restart=Never -- \
  curl -v http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80

# Check service exists
kubectl -n rook-ceph get service rook-ceph-rgw-s3-store
```

### S3 Manager Issues

**Problem: S3 Manager cannot connect to Rook-Ceph**

```bash
# Check S3 Manager logs
kubectl -n s3-manager-test logs -l app=s3-manager -f

# Verify credentials were fetched
kubectl -n s3-manager-test exec deployment/s3-manager -- ls -la /credentials

# Test S3 connectivity from S3 Manager pod
kubectl -n s3-manager-test exec deployment/s3-manager -- \
  curl -v http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80
```

**Problem: S3 credentials not found**

```bash
# Check if Rook-Ceph created the secret
kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager

# If missing, verify object store user was created
kubectl -n rook-ceph get cephobjectstoreuser

# Recreate if needed
kubectl delete -f k8s/rook-ceph/object-store-user.yaml
kubectl apply -f k8s/rook-ceph/object-store-user.yaml
```

### Using Ceph Toolbox

Deploy the Ceph toolbox for advanced debugging:

```bash
# Uncomment the toolbox section in cluster.yaml and apply
# Or deploy directly:
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/toolbox.yaml

# Access the toolbox
kubectl -n rook-ceph exec -it deployment/rook-ceph-tools -- bash

# Inside toolbox, useful commands:
ceph status
ceph health detail
ceph osd tree
ceph df
rados df
radosgw-admin user info --uid=s3-manager
radosgw-admin bucket list
```

## Cleanup

Remove the entire deployment:

```bash
# Delete all components
kubectl delete -k k8s/local/

# Or delete step-by-step:
kubectl delete -k k8s/local/test-deployment/   # S3 Manager
kubectl delete -k k8s/local/rook-ceph/         # Rook-Ceph (takes time)
kubectl delete -k k8s/local/keycloak/          # Keycloak
kubectl delete -k k8s/local/envoy-gateway/     # Envoy Gateway

# Delete CRDs (optional - removes all Rook CRDs)
kubectl delete -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
```

**Important:** If you want to completely clean up Ceph data on nodes:

```bash
# SSH to each node and run:
sudo rm -rf /var/lib/rook

# Or use Rook's cleanup job:
# https://rook.io/docs/rook/latest/Getting-Started/ceph-teardown/
```

## Production Considerations

This setup is for **testing only**. For production use:

1. **Use dedicated storage devices** - Don't use `useAllDevices: true`
2. **Enable monitoring** - Deploy Prometheus + Grafana for Ceph monitoring
3. **Configure dashboard** - Enable SSL for Ceph dashboard
4. **Set proper resource limits** - Adjust CPU/memory based on workload
5. **Enable backup/DR** - Configure Ceph snapshots and backups
6. **Use multiple failure domains** - Spread across availability zones
7. **Configure OIDC properly** - Don't use `LOCAL_DEV_MODE=true`
8. **Enable TLS** - Use SSL for RGW (S3 gateway)
9. **Set up monitoring** - Monitor Ceph health, capacity, and performance
10. **Review security** - Network policies, RBAC, secret management

## Additional Resources

- [Rook Documentation](https://rook.io/docs/rook/latest/)
- [Ceph Documentation](https://docs.ceph.com/)
- [Rook-Ceph Object Store CRD](https://rook.io/docs/rook/latest/CRDs/Object-Storage/ceph-object-store-crd/)
- [S3 Manager OIDC Setup](../docs/OIDC_SETUP.md)
- [S3 Manager Ingress Setup](../docs/INGRESS_SETUP.md)
