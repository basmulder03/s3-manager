# Quick Test & Access Guide

## Current Status Check

Run this to verify everything is running:

```powershell
kubectl get pods -A | findstr /C:"s3-manager" /C:"keycloak" /C:"localstack" /C:"envoy"
```

Expected output: All pods should show `Running` and `1/1` or `2/2` Ready.

---

## Access Methods (Try in Order)

### Method 1: NodePort (Direct Access)
The services are exposed on these ports:

```powershell
# Test S3 Manager
curl http://localhost:30080/health

# Test Keycloak
curl http://localhost:30081

# Test LocalStack
curl http://localhost:30082/_localstack/health
```

**If this doesn't work**, the kind cluster may not be forwarding ports correctly after sleep. Try Method 2.

---

### Method 2: Port Forwarding (Most Reliable)

Run these commands in **separate terminal windows**:

```powershell
# Terminal 1 - S3 Manager (using port 9080 to avoid conflicts)
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

---

### Method 3: Inside Cluster (Always Works)

Run a test pod inside the cluster:

```powershell
# Start a test pod with bash
kubectl run test-pod --rm -it --image=curlimages/curl -- sh

# Inside the pod, test services:
curl http://s3-manager.s3-manager-test.svc.cluster.local/health
curl http://keycloak.keycloak.svc.cluster.local
curl http://localstack.localstack.svc.cluster.local:4566/_localstack/health
```

---

## Troubleshooting

### If pods are not running:

```powershell
# Check pod status
kubectl get pods -A

# Restart crashed pods
kubectl rollout restart deployment/s3-manager -n s3-manager-test
kubectl rollout restart deployment/keycloak -n keycloak
kubectl rollout restart deployment/localstack -n localstack
```

### If kind cluster networking is broken after sleep:

**Option A: Restart Docker Desktop**
1. Right-click Docker Desktop system tray icon
2. Click "Restart"
3. Wait 30 seconds
4. Test again

**Option B: Restart kind cluster**
```powershell
kind delete cluster --name kind-cluster
# Then recreate it (you'll need to redeploy everything)
```

**Option C: Just use port-forwarding** (Method 2 above)
This always works regardless of cluster networking issues.

---

## Quick Deployment Test

Test if S3 Manager can connect to LocalStack:

```powershell
# Exec into S3 Manager pod
kubectl exec -it -n s3-manager-test deployment/s3-manager -- sh

# Inside the pod, test LocalStack connection:
curl http://localstack.localstack.svc.cluster.local:4566/_localstack/health

# Exit the pod
exit
```

---

## Full Redeploy (If everything is broken)

```powershell
# Delete and recreate everything
kubectl delete namespace s3-manager-test keycloak localstack --force --grace-period=0

# Wait 30 seconds, then redeploy
kubectl apply -k k8s/local/

# Watch pods come up
kubectl get pods -A -w
```

---

## What to tell me

Please run these commands and share the output:

```powershell
# 1. Check pods
kubectl get pods -A | findstr /C:"s3-manager" /C:"keycloak" /C:"localstack"

# 2. Try NodePort
curl http://localhost:30080/health

# 3. Check if Docker is running
docker ps
```

This will help me identify the exact issue!
