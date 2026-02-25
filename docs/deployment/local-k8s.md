# Local Kubernetes Cluster Setup Guide

Complete guide for deploying S3 Manager with Rook-Ceph and Keycloak OIDC on local Kubernetes clusters.

## Quick Start

If you already have a Kubernetes cluster running:

```bash
# 1. Apply Rook-Ceph CRDs (required first)
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# 2. Deploy everything with Kustomize
kubectl apply -k k8s/local/

# 3. Wait for deployments (5-10 minutes for Ceph)
kubectl -n envoy-gateway-system get gateway
kubectl -n keycloak get pods
kubectl -n rook-ceph get cephcluster
kubectl -n s3-manager-test get pods

# 4. Access S3 Manager
kubectl -n s3-manager-test port-forward svc/s3-manager 8080:80
# Open: http://localhost:8080
```

For detailed setup instructions, continue reading.

## Table of Contents

- [Quick Start](#quick-start)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Cluster Options](#cluster-options)
  - [minikube](#option-1-minikube-recommended-for-beginners)
  - [kind (Kubernetes in Docker)](#option-2-kind-kubernetes-in-docker)
  - [k3d (k3s in Docker)](#option-3-k3d-k3s-in-docker)
  - [MicroK8s](#option-4-microk8s)
- [Deploy with Kustomize](#deploy-with-kustomize)
- [Manual Deployment](#manual-deployment)
  - [Deploy Envoy Gateway](#deploy-envoy-gateway)
  - [Deploy Keycloak (OIDC Provider)](#deploy-keycloak-oidc-provider)
  - [Deploy Rook-Ceph](#deploy-rook-ceph)
  - [Deploy S3 Manager](#deploy-s3-manager)
- [Testing the Setup](#testing-the-setup)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)

---

## Overview

This guide shows how to set up a **complete local testing environment** with:

- **Local Kubernetes cluster** (minikube, kind, k3d, or MicroK8s)
- **Envoy Gateway** for modern, Gateway API-based ingress with native OIDC support
- **Keycloak** for OIDC authentication (deployed in-cluster)
- **Rook-Ceph** for S3-compatible storage
- **S3 Manager** with gateway-level OIDC authentication

This setup simulates a production environment locally, perfect for:
- Development and testing
- Learning Kubernetes, Gateway API, and S3
- CI/CD pipeline testing
- Feature validation before production deployment

### Architecture

The local setup uses **Envoy Gateway** instead of traditional NGINX Ingress for several advantages:
- **Native OIDC support** via SecurityPolicy (no external oauth2-proxy needed)
- **Gateway API** - modern, Kubernetes-native networking standard
- **Built-in rate limiting, timeouts, and security headers**
- **Better observability** and control

```
┌──────────────────────────────────────────────────────────────┐
│                    Client Browser                             │
└────────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              Envoy Gateway (Port 80)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  HTTPRoute + SecurityPolicy (OIDC)                   │   │
│  │  - Auto redirect to Keycloak for authentication      │   │
│  │  - Validate JWT tokens                                │   │
│  │  - Rate limiting & security headers                   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │                             │
          ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│    Keycloak      │          │   S3 Manager     │
│   (namespace:    │◄─────────│   (namespace:    │
│    keycloak)     │  verify  │ s3-manager-test) │
└──────────────────┘   token  └────────┬─────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │   Rook-Ceph RGW  │
                               │   (namespace:    │
                               │    rook-ceph)    │
                               └──────────────────┘
```

---

## Prerequisites

### System Requirements

- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 20GB free space
- **OS**: Linux, macOS, or Windows with WSL2

### Software Requirements

- **Container Runtime**: Docker, Podman, or containerd
- **kubectl**: Kubernetes command-line tool
- **Helm**: Package manager for Kubernetes (v3.x)

### Install kubectl

```bash
# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# macOS (with Homebrew)
brew install kubectl

# Windows (with Chocolatey)
choco install kubernetes-cli

# Verify installation
kubectl version --client
```

### Install Helm

```bash
# Linux/macOS
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# macOS (with Homebrew)
brew install helm

# Windows (with Chocolatey)
choco install kubernetes-helm

# Verify installation
helm version
```

---

## Cluster Options

Choose one of the following local Kubernetes distributions based on your needs:

| Distribution | Best For | Pros | Cons |
|--------------|----------|------|------|
| **minikube** | Beginners, GUI users | Easy setup, addons, dashboard | Higher resource usage |
| **kind** | CI/CD, multi-node testing | Fast, multi-node clusters | Docker required |
| **k3d** | Lightweight, fast setup | Very fast, low resources | Limited to k3s features |
| **MicroK8s** | Ubuntu users, IoT | Native installation, snap-based | Linux/WSL only |

---

## Option 1: minikube (Recommended for Beginners)

### Installation

```bash
# Linux
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# macOS
brew install minikube

# Windows
choco install minikube

# Verify
minikube version
```

### Start Cluster with Rook-Ceph Requirements

```bash
# Start minikube with adequate resources
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=40g \
  --driver=docker \
  --nodes=3 \
  --kubernetes-version=v1.28.0

# Enable addons
minikube addons enable metrics-server
# Note: We'll install Envoy Gateway separately instead of using the ingress addon

# Verify cluster
kubectl cluster-info
kubectl get nodes
```

### Configure DNS for Keycloak and S3 Manager

```bash
# Get minikube IP
export MINIKUBE_IP=$(minikube ip)
echo "Minikube IP: $MINIKUBE_IP"

# Add to /etc/hosts (Linux/macOS)
sudo bash -c "cat >> /etc/hosts <<EOF
$MINIKUBE_IP keycloak.local
$MINIKUBE_IP s3-manager.local
EOF"

# Windows: Add to C:\Windows\System32\drivers\etc\hosts
# <minikube-ip> keycloak.local
# <minikube-ip> s3-manager.local
```

### Expose Services (Alternative to /etc/hosts)

```bash
# In separate terminals, keep these running:
minikube tunnel  # Exposes LoadBalancer services

# Or use port-forwarding (see Testing section)
```

---

## Option 2: kind (Kubernetes in Docker)

### Installation

```bash
# Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# macOS
brew install kind

# Windows
choco install kind

# Verify
kind version
```

### Create Multi-Node Cluster

```bash
# Create kind cluster configuration
cat <<EOF > kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
- role: worker
- role: worker
- role: worker
EOF

# Create cluster
kind create cluster --name s3-manager-test --config kind-config.yaml

# Verify
kubectl cluster-info --context kind-s3-manager-test
kubectl get nodes
```

### Configure DNS

```bash
# Add to /etc/hosts
sudo bash -c "cat >> /etc/hosts <<EOF
127.0.0.1 keycloak.local
127.0.0.1 s3-manager.local
EOF"
```

---

## Option 3: k3d (k3s in Docker)

### Installation

```bash
# Linux/macOS
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Windows
choco install k3d

# Verify
k3d version
```

### Create Cluster

```bash
# Create k3d cluster with port mappings
k3d cluster create s3-manager-test \
  --agents 3 \
  --port "80:80@loadbalancer" \
  --port "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0"

# Verify
kubectl cluster-info
kubectl get nodes
```

### Configure DNS

```bash
# Add to /etc/hosts
sudo bash -c "cat >> /etc/hosts <<EOF
127.0.0.1 keycloak.local
127.0.0.1 s3-manager.local
EOF"
```

---

## Option 4: MicroK8s

### Installation

```bash
# Ubuntu/Debian
sudo snap install microk8s --classic

# Add user to microk8s group
sudo usermod -a -G microk8s $USER
sudo chown -f -R $USER ~/.kube
newgrp microk8s

# Verify
microk8s status --wait-ready
```

### Configure Cluster

```bash
# Enable required addons
microk8s enable dns
microk8s enable storage
microk8s enable metrics-server
# Note: We'll install Envoy Gateway separately instead of using the ingress addon

# Create kubectl alias
alias kubectl='microk8s kubectl'

# Or export kubeconfig
microk8s config > ~/.kube/config

# Verify
kubectl get nodes
```

### Configure DNS

```bash
# Get node IP
export NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

# Add to /etc/hosts
sudo bash -c "cat >> /etc/hosts <<EOF
$NODE_IP keycloak.local
$NODE_IP s3-manager.local
EOF"
```

---

## Deploy with Kustomize

The easiest way to deploy everything is using Kustomize (built into kubectl).

### One-Command Deployment

```bash
# 1. First, install Rook-Ceph CRDs (required)
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# 2. Deploy all components (Envoy Gateway, Keycloak, Rook-Ceph, S3 Manager)
kubectl apply -k k8s/local/

# This deploys:
# - Envoy Gateway (envoy-gateway-system namespace)
# - Keycloak (keycloak namespace)
# - Rook-Ceph (rook-ceph namespace)
# - S3 Manager (s3-manager-test namespace)
```

### Monitor Deployment

```bash
# Watch all namespaces
kubectl get ns

# Check Envoy Gateway (should be ready in 1-2 minutes)
kubectl -n envoy-gateway-system get pods,gateway

# Check Keycloak (should be ready in 2-3 minutes)
kubectl -n keycloak get pods

# Check Rook-Ceph (takes 5-10 minutes to become healthy)
kubectl -n rook-ceph get cephcluster -w

# Check S3 Manager (should be ready in 1-2 minutes)
kubectl -n s3-manager-test get pods
```

### Access Applications

```bash
# Port-forward S3 Manager
kubectl -n s3-manager-test port-forward svc/s3-manager 8080:80
# Open: http://localhost:8080

# Port-forward Keycloak (optional)
kubectl -n keycloak port-forward svc/keycloak 8081:8080
# Open: http://localhost:8081 (admin/admin)
```

**Test Users:**
- `admin/admin123` - Full access
- `editor/editor123` - View + write
- `viewer/viewer123` - View only

### Step-by-Step Deployment

If you prefer to deploy components one at a time:

```bash
# 1. Install CRDs first
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# 2. Deploy Envoy Gateway
kubectl apply -k k8s/local/envoy-gateway/
kubectl -n envoy-gateway-system wait --for=condition=ready pod -l control-plane=envoy-gateway --timeout=120s

# 3. Deploy Keycloak
kubectl apply -k k8s/local/keycloak/
kubectl -n keycloak wait --for=condition=available deployment/keycloak --timeout=300s

# 4. Deploy Rook-Ceph (this takes time - 5-10 minutes)
kubectl apply -k k8s/local/rook-ceph/
kubectl -n rook-ceph get cephcluster -w  # Watch until HEALTH_OK

# 5. Deploy S3 Manager
kubectl apply -k k8s/local/test-deployment/
kubectl -n s3-manager-test wait --for=condition=available deployment/s3-manager --timeout=120s
```

---

## Manual Deployment

If you prefer to deploy components manually without Kustomize, follow these sections:

## Install Envoy Gateway

After setting up your cluster, install Envoy Gateway for modern, Gateway API-based ingress with native OIDC support.

### Why Envoy Gateway?

Envoy Gateway provides several advantages over traditional NGINX Ingress:
- **Native OIDC support** via SecurityPolicy (no external oauth2-proxy needed)
- **Gateway API** - Kubernetes-native networking standard
- **Better observability** and control
- **Built-in rate limiting, timeouts, and security headers**

### Installation

```bash
# Install Envoy Gateway using Helm
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.0.1 \
  --namespace envoy-gateway-system \
  --create-namespace \
  --wait

# Wait for Envoy Gateway to be ready
kubectl wait --for=condition=ready pod \
  -l control-plane=envoy-gateway \
  -n envoy-gateway-system \
  --timeout=120s

# Create Gateway resource
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: envoy-gateway-system
spec:
  gatewayClassName: eg
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
EOF

# Wait for Gateway to be programmed
kubectl wait --for=condition=Programmed gateway/eg \
  -n envoy-gateway-system \
  --timeout=120s

# Verify installation
kubectl get gateway -n envoy-gateway-system
kubectl get pods -n envoy-gateway-system
```

Expected output:
```
NAME   CLASS   ADDRESS        PROGRAMMED   AGE
eg     eg      10.96.xxx.xxx  True         1m

NAME                                        READY   STATUS    RESTARTS   AGE
envoy-gateway-xxx                          1/1     Running   0          2m
envoy-eg-xxx                               1/1     Running   0          1m
```

---

## Deploy Keycloak (OIDC Provider)

Keycloak is pre-configured with the S3 Manager realm, OIDC client, and test users.

### Deploy Using Pre-configured Manifest

```bash
# Deploy Keycloak with Envoy Gateway HTTPRoute
kubectl apply -f k8s/keycloak/keycloak-local.yaml

# Wait for Keycloak to be ready (takes 1-2 minutes)
kubectl wait --for=condition=ready pod \
  -l app=keycloak \
  -n keycloak \
  --timeout=300s

# Verify deployment
kubectl get pods -n keycloak
kubectl get httproute -n keycloak
```

### Verify Keycloak Access

```bash
# Check if Gateway route is configured
kubectl get httproute keycloak -n keycloak

# Access Keycloak
echo "Keycloak URL: http://keycloak.local"
echo "Admin credentials: admin / admin"
```

Open http://keycloak.local in your browser to verify Keycloak is accessible.

### Pre-configured Settings

The deployment includes:
- **Realm**: `s3-manager`
- **OIDC Client**: `s3-manager-client`
  - Client ID: `s3-manager-client`
  - Client Secret: `dev-client-secret-12345`
  - Redirect URIs: `http://s3-manager.local/*`
- **Test Users**:
  - `admin / admin123` - S3-Admin role (full access)
  - `editor / editor123` - S3-Editor role (view + write)
  - `viewer / viewer123` - S3-Viewer role (view only)

### Manual Configuration (Optional)

If you prefer to configure Keycloak manually or need to modify settings:

```bash
# Manual Keycloak configuration (if you didn't use the pre-configured manifest above)
# You can access the admin console at http://keycloak.local
# Login: admin / admin
```

---

## Deploy Rook-Ceph

Follow the comprehensive Rook-Ceph setup from `k8s/README.md`:

### Quick Deployment

```bash
# 1. Install CRDs
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml

# 2. Deploy Rook operator
kubectl apply -f k8s/rook-ceph/operator.yaml

# 3. Wait for operator
kubectl -n rook-ceph wait --for=condition=ready pod -l app=rook-ceph-operator --timeout=300s

# 4. Deploy Ceph cluster (this takes 5-10 minutes)
kubectl apply -f k8s/rook-ceph/cluster.yaml

# 5. Monitor cluster creation
kubectl -n rook-ceph get cephcluster -w
# Wait for status: HEALTH_OK

# 6. Deploy S3 gateway
kubectl apply -f k8s/rook-ceph/object-store.yaml

# 7. Wait for object store
kubectl -n rook-ceph wait --for=condition=ready cephobjectstore/s3-store --timeout=300s

# 8. Create S3 user and test bucket
kubectl apply -f k8s/rook-ceph/object-store-user.yaml

# 9. Get S3 credentials
kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager -o jsonpath='{.data.AccessKey}' | base64 -d && echo
kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager -o jsonpath='{.data.SecretKey}' | base64 -d && echo
```

### Verify Rook-Ceph

```bash
# Check cluster health
kubectl -n rook-ceph get cephcluster

# Check all pods are running
kubectl -n rook-ceph get pods

# Verify S3 gateway
kubectl -n rook-ceph get service rook-ceph-rgw-s3-store
```

---

## Deploy S3 Manager

### Using Pre-configured Test Deployment (Recommended)

The test deployment includes Envoy Gateway integration with SecurityPolicy for OIDC authentication:

```bash
# Deploy S3 Manager with Envoy Gateway and OIDC
kubectl apply -f k8s/test-deployment/s3-manager-test.yaml

# Wait for deployment (takes 1-2 minutes)
kubectl wait --for=condition=ready pod \
  -l app=s3-manager \
  -n s3-manager-test \
  --timeout=120s

# Check status
kubectl get pods -n s3-manager-test
kubectl get httproute -n s3-manager-test
kubectl get securitypolicy -n s3-manager-test
```

### Verify Deployment

```bash
# Check all resources
kubectl get all -n s3-manager-test

# View logs
kubectl -n s3-manager-test logs -l app=s3-manager -f

# Check Gateway routing
kubectl get httproute s3-manager -n s3-manager-test -o yaml
```

### Architecture

The deployment uses:
- **Envoy Gateway HTTPRoute** for routing traffic to S3 Manager
- **SecurityPolicy** for OIDC authentication at the gateway level
- **BackendTrafficPolicy** for rate limiting (100 requests/minute)
- **Rook-Ceph credentials** auto-fetched via init container

```
http://s3-manager.local
         ↓
    Envoy Gateway
         ↓
   SecurityPolicy (OIDC)
    ├─ Redirect to Keycloak
    ├─ Validate JWT token
    └─ Forward to S3 Manager
         ↓
    S3 Manager Pod
         ↓
    Rook-Ceph RGW (S3)
```

### Alternative: Using Helm Chart

If you prefer to use the Helm chart directly with custom values:

```bash
# Create namespace
kubectl create namespace s3-manager

# Create OIDC client secret
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='dev-client-secret-12345' \
  -n s3-manager

# Get S3 credentials from Rook-Ceph
export S3_ACCESS_KEY=$(kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager -o jsonpath='{.data.AccessKey}' | base64 -d)
export S3_SECRET_KEY=$(kubectl -n rook-ceph get secret rook-ceph-object-user-s3-store-s3-manager -o jsonpath='{.data.SecretKey}' | base64 -d)

# Use the pre-configured Envoy Gateway values file
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-envoy-keycloak.yaml \
  --set config.s3.accessKeyId="${S3_ACCESS_KEY}" \
  --set config.s3.secretAccessKey="${S3_SECRET_KEY}" \
  -n s3-manager

# Wait for deployment
kubectl -n s3-manager wait --for=condition=available deployment/s3-manager --timeout=120s

# Check status
kubectl -n s3-manager get pods
kubectl -n s3-manager get httproute
```

---

## Testing the Setup

### Access S3 Manager

```bash
# Option 1: Via Envoy Gateway (recommended)
echo "Open http://s3-manager.local in your browser"

# Option 2: Port Forward (bypass gateway)
kubectl -n s3-manager-test port-forward svc/s3-manager 8080:80
# Then open: http://localhost:8080
```

### Automatic OIDC Authentication

When using Envoy Gateway with SecurityPolicy:

1. **Open S3 Manager** at http://s3-manager.local
2. **Automatic redirect** - Envoy Gateway automatically redirects to Keycloak (no "Login" button needed)
3. **Login with test users**:
   - **Admin**: `admin` / `admin123` (full access)
   - **Editor**: `editor` / `editor123` (view + write)
   - **Viewer**: `viewer` / `viewer123` (view only)
4. **Automatic redirect back** - After successful authentication, you're redirected to S3 Manager

> **Note**: The OIDC authentication happens at the Envoy Gateway level using SecurityPolicy, so all requests to `http://s3-manager.local` require authentication before reaching the application.

### Test S3 Operations

```bash
# 1. View buckets - Should see "test-bucket" created by init job
# 2. Browse bucket - Should see "test-file.txt" from init job
# 3. Download test-file.txt
# 4. Upload a new file (if you have write permissions)
# 5. Delete a file (if you have admin permissions)
```

### Verify Envoy Gateway OIDC Flow

```bash
# Check Envoy Gateway logs
kubectl -n envoy-gateway-system logs -l gateway.envoyproxy.io/owning-gateway-name=eg -f

# Check SecurityPolicy status
kubectl get securitypolicy -n s3-manager-test s3-manager-oidc -o yaml

# Check S3 Manager logs (should show authenticated requests)
kubectl -n s3-manager-test logs -l app=s3-manager -f

# Should see requests with authentication headers from Envoy Gateway
```

### Test S3 API Directly

```bash
# Run AWS CLI in cluster
kubectl run -it --rm aws-cli --image=amazon/aws-cli --restart=Never -- bash

# Inside pod:
export AWS_ACCESS_KEY_ID=<from-rook-ceph-secret>
export AWS_SECRET_ACCESS_KEY=<from-rook-ceph-secret>
export AWS_DEFAULT_REGION=us-east-1

# List buckets
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 ls

# List files in test-bucket
aws --endpoint-url=http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80 s3 ls s3://test-bucket/
```

---

## Troubleshooting

### Quick Diagnostic Commands

Before diving into specific issues, run these commands to get an overview:

```bash
# Quick health check using the diagnostic script (recommended!)
# Linux/macOS:
./scripts/diagnose-envoy-gateway.sh

# Windows PowerShell:
.\scripts\diagnose-envoy-gateway.ps1

# Windows Git Bash/WSL:
./scripts/diagnose-envoy-gateway.sh

# Or manually check components:

# 1. Check all components status
kubectl get pods -A | grep -E 'envoy|keycloak|s3-manager|rook'

# 2. Check Envoy Gateway health
kubectl get gateway,gatewayclass,httproute -A

# 3. Check if Gateway is Programmed (most important!)
kubectl get gateway eg -n envoy-gateway-system -o jsonpath='{.status.conditions[?(@.type=="Programmed")]}{"\n"}'
# Should show: {"type":"Programmed","status":"True",...}

# 4. Quick service check
kubectl get svc -A | grep -E 'keycloak|s3-manager|envoy'

# 5. View recent events
kubectl get events -A --sort-by='.lastTimestamp' | tail -20
```

**💡 TIP**: Use the automated diagnostic script for comprehensive health checks and troubleshooting recommendations!
- **Linux/macOS**: `./scripts/diagnose-envoy-gateway.sh`
- **Windows**: `.\scripts\diagnose-envoy-gateway.ps1`

**Common Status Checks:**

| Component | Check Command | Expected Result |
|-----------|--------------|-----------------|
| Gateway | `kubectl get gateway eg -n envoy-gateway-system` | `PROGRAMMED=True` |
| GatewayClass | `kubectl get gatewayclass eg` | `ACCEPTED=True` |
| HTTPRoutes | `kubectl get httproute -A` | Routes listed |
| Keycloak | `kubectl get pods -n keycloak` | `STATUS=Running` |
| S3 Manager | `kubectl get pods -n s3-manager-test` | `STATUS=Running` |
| Rook-Ceph | `kubectl get cephcluster -n rook-ceph` | `HEALTH=HEALTH_OK` |

---

### Common Issues

#### 1. Envoy Gateway Not Programmed

**Problem**: Gateway shows `Programmed=False` or `Accepted=False`

This is the most common issue. The Gateway needs to be "Programmed" before it can route traffic.

**Step 1: Check Gateway Status**

```bash
# Check Gateway status
kubectl get gateway eg -n envoy-gateway-system

# Expected output:
# NAME   CLASS   ADDRESS        PROGRAMMED   AGE
# eg     eg      10.96.xxx.xxx  True         5m

# If PROGRAMMED shows "False" or "Unknown", continue troubleshooting
```

**Step 2: Diagnose the Issue**

```bash
# Get detailed status
kubectl get gateway eg -n envoy-gateway-system -o yaml

# Look for status.conditions section:
# - type: Accepted (should be True)
# - type: Programmed (should be True)

# Check for error messages in conditions
kubectl get gateway eg -n envoy-gateway-system -o jsonpath='{.status.conditions[*].message}'
```

**Step 3: Common Causes and Solutions**

**Cause A: GatewayClass not found or invalid**

```bash
# Check if GatewayClass exists
kubectl get gatewayclass

# Should see:
# NAME   CONTROLLER                                      ACCEPTED   AGE
# eg     gateway.envoyproxy.io/gatewayclass-controller   True       5m

# If missing, create it:
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
EOF
```

**Cause B: Envoy Gateway controller not running**

```bash
# Check Envoy Gateway pods
kubectl get pods -n envoy-gateway-system

# Should see:
# NAME                              READY   STATUS    RESTARTS   AGE
# envoy-gateway-xxx                 1/1     Running   0          5m
# envoy-eg-xxx                      1/1     Running   0          2m

# If envoy-gateway pod is not running:
kubectl describe pod -n envoy-gateway-system -l control-plane=envoy-gateway

# Check logs for errors:
kubectl logs -n envoy-gateway-system -l control-plane=envoy-gateway --tail=50
```

**Cause C: Gateway API CRDs not installed**

```bash
# Check if Gateway API CRDs are installed
kubectl get crd | grep gateway

# Should see:
# gatewayclasses.gateway.networking.k8s.io
# gateways.gateway.networking.k8s.io
# httproutes.gateway.networking.k8s.io

# If missing, install Gateway API CRDs:
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
```

**Cause D: LoadBalancer service pending (local clusters)**

```bash
# Check if Gateway service is pending
kubectl get svc -n envoy-gateway-system

# For local clusters (kind/k3d/minikube), the LoadBalancer might be pending
# This is OK - the Gateway can still work with ClusterIP

# For kind/k3d, ensure port mappings are correct (80:80, 443:443)

# For minikube, run minikube tunnel in a separate terminal:
minikube tunnel
```

**Cause E: RBAC permissions issue**

```bash
# Check if Envoy Gateway has proper permissions
kubectl get clusterrole | grep envoy-gateway
kubectl get clusterrolebinding | grep envoy-gateway

# If missing, reinstall Envoy Gateway:
helm uninstall eg -n envoy-gateway-system
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.0.1 \
  -n envoy-gateway-system \
  --create-namespace \
  --wait
```

**Step 4: Force Gateway Reconciliation**

```bash
# Delete and recreate the Gateway (this often fixes stuck states)
kubectl delete gateway eg -n envoy-gateway-system

# Wait 10 seconds, then recreate:
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: envoy-gateway-system
spec:
  gatewayClassName: eg
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
EOF

# Wait for Gateway to be programmed (up to 2 minutes):
kubectl wait --for=condition=Programmed gateway/eg \
  -n envoy-gateway-system \
  --timeout=120s
```

**Step 5: Verify Envoy Proxy Pod**

```bash
# The Gateway creates an Envoy proxy pod (the actual data plane)
kubectl get pods -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=eg

# If this pod doesn't exist or is failing, check logs:
kubectl logs -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=eg

# Common issue: Port 80 already in use
# Solution: Check if another service is using port 80
kubectl get svc -A | grep LoadBalancer
```

**Step 6: Complete Reset (if all else fails)**

```bash
# 1. Delete all Gateway resources
kubectl delete gateway eg -n envoy-gateway-system
kubectl delete gatewayclass eg

# 2. Uninstall Envoy Gateway
helm uninstall eg -n envoy-gateway-system

# 3. Wait for cleanup
sleep 30

# 4. Reinstall everything
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.0.1 \
  -n envoy-gateway-system \
  --create-namespace \
  --wait

# 5. Recreate GatewayClass and Gateway
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: envoy-gateway-system
spec:
  gatewayClassName: eg
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
EOF

# 6. Wait and verify
kubectl wait --for=condition=Programmed gateway/eg -n envoy-gateway-system --timeout=120s
kubectl get gateway eg -n envoy-gateway-system
```

#### 1b. Envoy Gateway Working But Routes Not Accessible

**Problem**: Gateway is Programmed=True but HTTPRoutes don't work

**Solutions**:

```bash
# Check HTTPRoute status
kubectl get httproute -A

# Describe HTTPRoute to see acceptance status
kubectl describe httproute keycloak -n keycloak
kubectl describe httproute s3-manager -n s3-manager-test

# Look for "Accepted: True" and "ResolvedRefs: True" in conditions

# Check if HTTPRoute references correct Gateway
kubectl get httproute keycloak -n keycloak -o yaml | grep -A5 parentRefs

# Should show:
# parentRefs:
# - name: eg
#   namespace: envoy-gateway-system

# Check backend service exists
kubectl get svc keycloak -n keycloak
kubectl get svc s3-manager -n s3-manager-test

# View Envoy Gateway logs for routing errors
kubectl logs -n envoy-gateway-system -l control-plane=envoy-gateway --tail=100

# View Envoy proxy logs (actual data plane)
kubectl logs -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=eg -f

# Test Gateway endpoints directly via port-forward
kubectl -n envoy-gateway-system port-forward deployment/envoy-eg 8888:80
# Then test: curl -H "Host: keycloak.local" http://localhost:8888
```

#### 2. OIDC Authentication Loop

**Problem**: Keeps redirecting between Keycloak and S3 Manager in a loop

**Solutions**:

```bash
# Check SecurityPolicy OIDC configuration
kubectl get securitypolicy s3-manager-oidc -n s3-manager-test -o yaml

# Verify redirect URL matches
# SecurityPolicy should have: redirectURL: "http://s3-manager.local/oauth2/callback"
# Keycloak client should have: "http://s3-manager.local/*" in Valid Redirect URIs

# Check OIDC client secret exists
kubectl get secret s3-manager-secret -n s3-manager-test

# Test Keycloak endpoints
curl -I http://keycloak.local/realms/s3-manager/.well-known/openid-configuration

# Disable SecurityPolicy temporarily to test app directly
kubectl delete securitypolicy s3-manager-oidc -n s3-manager-test
# Access app directly and see if it works
# Then re-apply: kubectl apply -f k8s/test-deployment/s3-manager-test.yaml
```

#### 3. Cannot Access Keycloak or S3 Manager

**Problem**: Browser cannot resolve `keycloak.local` or `s3-manager.local`

**Solutions**:

```bash
# Verify /etc/hosts entries exist
cat /etc/hosts | grep -E 'keycloak|s3-manager'

# For minikube, verify IP is correct
minikube ip

# For kind/k3d, should be 127.0.0.1

# Alternative: Use port-forwarding
kubectl -n keycloak port-forward svc/keycloak 8090:80
kubectl -n s3-manager-test port-forward svc/s3-manager 8080:80
# Then access: http://localhost:8090 and http://localhost:8080
```

#### 4. Keycloak OIDC Configuration Issues

**Problem**: OIDC authentication not working properly at application level (when not using Envoy Gateway SecurityPolicy)

**Solutions**:

```bash
# Check redirect URI matches in both places
kubectl -n s3-manager-test get deployment s3-manager -o yaml | grep REDIRECT

# Verify Keycloak client configuration
# Login to Keycloak admin: http://keycloak.local
# Go to: Clients > s3-manager-client > Settings
# Valid Redirect URIs should include: http://s3-manager.local/*

# Update if needed (requires re-importing realm or manual config)
```

#### 5. Rook-Ceph Cluster Not Healthy

**Problem**: `kubectl -n rook-ceph get cephcluster` shows `HEALTH_WARN` or stuck in `Progressing`

**Solutions**:

```bash
# For minikube: Ensure you have 3 nodes
minikube node list

# Check operator logs
kubectl -n rook-ceph logs -l app=rook-ceph-operator -f

# Check for OSD issues
kubectl -n rook-ceph get pods | grep osd

# Common fix: Delete and recreate cluster
kubectl delete -f k8s/rook-ceph/cluster.yaml
# Wait for cleanup (2-3 minutes)
kubectl apply -f k8s/rook-ceph/cluster.yaml
```

#### 6. S3 Manager Cannot Connect to Rook-Ceph

**Problem**: S3 Manager shows "Cannot connect to S3"

**Solutions**:

```bash
# Verify S3 gateway is running
kubectl -n rook-ceph get service rook-ceph-rgw-s3-store

# Test connectivity from S3 Manager pod
kubectl -n s3-manager-test exec deployment/s3-manager -- \
  curl -v http://rook-ceph-rgw-s3-store.rook-ceph.svc.cluster.local:80

# Check S3 credentials
kubectl -n s3-manager-test logs -l app=s3-manager | grep -i s3

# Verify credentials were properly fetched
kubectl -n s3-manager-test get secret s3-manager-secret -o yaml
```

#### 7. Insufficient Resources

**Problem**: Pods stuck in `Pending` or `CrashLoopBackOff`

**Solutions**:

```bash
# Check node resources
kubectl top nodes

# For minikube: Increase resources
minikube stop
minikube start --cpus=6 --memory=12288

# For kind/k3d: Increase Docker resources
# Docker Desktop > Settings > Resources > Increase CPU/Memory

# Check pod resource requests
kubectl describe pod <pod-name> -n <namespace>
```

### Debug Commands

```bash
# Check all resources
kubectl get all -A

# View S3 Manager logs
kubectl -n s3-manager logs -l app=s3-manager -f

# View Keycloak logs
kubectl -n keycloak logs -l app=keycloak -f

# View Rook-Ceph operator logs
kubectl -n rook-ceph logs -l app=rook-ceph-operator -f

# Check Ceph status
kubectl -n rook-ceph exec -it deployment/rook-ceph-tools -- ceph status

# Describe failing pod
kubectl -n <namespace> describe pod <pod-name>

# Get events
kubectl get events --sort-by='.lastTimestamp' -A
```

---

## Cleanup

### Quick Cleanup (Kustomize)

If you deployed with Kustomize:

```bash
# Delete all components at once
kubectl delete -k k8s/

# Or delete step-by-step:
kubectl delete -k k8s/test-deployment/   # S3 Manager
kubectl delete -k k8s/rook-ceph/         # Rook-Ceph (takes time)
kubectl delete -k k8s/keycloak/          # Keycloak
kubectl delete -k k8s/envoy-gateway/     # Envoy Gateway

# Optional: Delete CRDs
kubectl delete -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
```

### Manual Cleanup

If you deployed manually:

#### Delete S3 Manager

```bash
# Using Helm
helm uninstall s3-manager -n s3-manager
kubectl delete namespace s3-manager

# Or using manifests
kubectl delete -f k8s/test-deployment/s3-manager-test.yaml
```

#### Delete Keycloak

```bash
kubectl delete namespace keycloak
```

##### Delete Rook-Ceph

```bash
# Delete in reverse order
kubectl delete -f k8s/rook-ceph/object-store-user.yaml
kubectl delete -f k8s/rook-ceph/object-store.yaml
kubectl delete -f k8s/rook-ceph/cluster.yaml

# Wait for cluster cleanup (2-3 minutes)
kubectl -n rook-ceph get pods -w

kubectl delete -f k8s/rook-ceph/operator.yaml
kubectl delete namespace rook-ceph

# Delete CRDs (optional)
kubectl delete -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
```

#### Delete Envoy Gateway

```bash
helm uninstall eg -n envoy-gateway-system
kubectl delete namespace envoy-gateway-system
```

### Delete Cluster

```bash
# minikube
minikube stop
minikube delete --all

# kind
kind delete cluster --name s3-manager-test

# k3d
k3d cluster delete s3-manager-test

# MicroK8s
microk8s reset
sudo snap remove microk8s
```

### Clean /etc/hosts

```bash
# Remove entries added for this guide
sudo sed -i.bak '/keycloak.local/d' /etc/hosts
sudo sed -i.bak '/s3-manager.local/d' /etc/hosts
```

---

## Next Steps

- **Production Deployment**: See [Ingress Setup Guide](ingress.md) for production Kubernetes setup
- **OIDC Configuration**: See [OIDC Setup Guide](../getting-started/oidc-providers.md) for Azure AD, Google OAuth setup
- **Customize Keycloak**: Add more users, configure groups, customize themes
- **Monitor Ceph**: Deploy Prometheus + Grafana for Ceph monitoring
- **CI/CD Integration**: Use these manifests in your CI/CD pipelines

---

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [minikube Documentation](https://minikube.sigs.k8s.io/)
- [kind Documentation](https://kind.sigs.k8s.io/)
- [k3d Documentation](https://k3d.io/)
- [MicroK8s Documentation](https://microk8s.io/)
- [Rook-Ceph Documentation](https://rook.io/docs/rook/latest/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
