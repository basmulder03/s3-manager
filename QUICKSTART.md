# S3 Manager - Quick Start Guide

## Overview

S3 Manager is a lightweight web application for managing S3 buckets in Rook-Ceph clusters with Microsoft Entra ID (Azure AD) authentication and PIM support.

## Prerequisites Checklist

Before deploying, ensure you have:

- [ ] Kubernetes cluster (1.20+) with kubectl access
- [ ] Helm 3.x installed
- [ ] Rook-Ceph deployed with S3 gateway (RGW)
- [ ] Azure AD tenant with admin access
- [ ] Container registry access (Docker Hub, ACR, etc.)
- [ ] Ingress controller installed (nginx recommended)
- [ ] Cert-manager (optional, for TLS)

## Step 1: Azure AD Setup (15 minutes)

### Create App Registration

1. Go to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Fill in:
   - **Name:** S3 Manager
   - **Account types:** Single tenant
   - **Redirect URI:** `https://your-domain.com/auth/callback`
4. Note the **Application (client) ID** and **Directory (tenant) ID**

### Create Client Secret

1. Go to Certificates & secrets → New client secret
2. Add description: "S3 Manager Secret"
3. Set expiration (e.g., 24 months)
4. **Copy the secret value immediately** (you won't see it again!)

### Configure API Permissions

1. Go to API permissions → Add permission
2. Select Microsoft Graph → Delegated permissions
3. Add:
   - `User.Read`
   - `GroupMember.Read.All`
4. Click "Grant admin consent for [your organization]"

### Create Security Groups

Create three security groups for role-based access:

```bash
# Using Azure CLI
az ad group create --display-name "S3-Viewer" --mail-nickname "S3-Viewer"
az ad group create --display-name "S3-Editor" --mail-nickname "S3-Editor"
az ad group create --display-name "S3-Admin" --mail-nickname "S3-Admin"
```

**Or via Azure Portal:**
1. Go to Azure AD → Groups → New group
2. Group type: Security
3. Create groups: S3-Viewer, S3-Editor, S3-Admin
4. Add members to each group

**Role Permissions:**
- **S3-Viewer:** Can list buckets and objects, download files
- **S3-Editor:** Can also upload files
- **S3-Admin:** Can also delete files

## Step 2: Get Rook-Ceph Credentials (5 minutes)

### Find RGW Service

```bash
kubectl get svc -n rook-ceph | grep rgw
```

Example output:
```
rook-ceph-rgw-my-store   ClusterIP   10.96.1.100   <none>   8080/TCP
```

Your S3 endpoint: `http://rook-ceph-rgw-my-store.rook-ceph.svc.cluster.local:8080`

### Get S3 Access Keys

```bash
# Replace 'my-store' and 'my-user' with your actual names
STORE_NAME="my-store"
USER_NAME="my-user"

# Get Access Key
kubectl get secret -n rook-ceph \
  rook-ceph-object-user-${STORE_NAME}-${USER_NAME} \
  -o jsonpath='{.data.AccessKey}' | base64 -d && echo

# Get Secret Key
kubectl get secret -n rook-ceph \
  rook-ceph-object-user-${STORE_NAME}-${USER_NAME} \
  -o jsonpath='{.data.SecretKey}' | base64 -d && echo
```

## Step 3: Build Docker Image (10 minutes)

### Build Image

```bash
# Clone repository if not already done
git clone https://github.com/basmulder03/s3-manager.git
cd s3-manager

# Build image
docker build -t s3-manager:1.0.0 .
```

### Push to Registry

**For Docker Hub:**
```bash
docker login
docker tag s3-manager:1.0.0 your-username/s3-manager:1.0.0
docker push your-username/s3-manager:1.0.0
```

**For Azure Container Registry:**
```bash
az acr login --name yourregistry
docker tag s3-manager:1.0.0 yourregistry.azurecr.io/s3-manager:1.0.0
docker push yourregistry.azurecr.io/s3-manager:1.0.0
```

## Step 4: Configure Deployment (10 minutes)

### Generate Secret Key

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Save this output - you'll need it in the next step.

### Create values.yaml

Create a file `values-production.yaml`:

```yaml
replicaCount: 2

image:
  repository: your-registry/s3-manager  # Update with your registry
  tag: "1.0.0"
  pullPolicy: IfNotPresent

# For private registries
imagePullSecrets:
  - name: registry-secret  # If needed

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
  hosts:
    - host: s3-manager.your-domain.com  # UPDATE THIS
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: s3-manager-tls
      hosts:
        - s3-manager.your-domain.com  # UPDATE THIS

config:
  secretKey: "YOUR-GENERATED-SECRET-KEY"  # From step above
  sessionCookieSecure: true
  
  azureAd:
    tenantId: "YOUR-TENANT-ID"      # From Step 1
    clientId: "YOUR-CLIENT-ID"      # From Step 1
    clientSecret: "YOUR-CLIENT-SECRET"  # From Step 1
  
  pim:
    enabled: true  # Set to false if not using PIM
  
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
  
  s3:
    endpoint: "http://rook-ceph-rgw-my-store.rook-ceph.svc.cluster.local:8080"  # From Step 2
    accessKey: "YOUR-S3-ACCESS-KEY"  # From Step 2
    secretKey: "YOUR-S3-SECRET-KEY"  # From Step 2
    region: "us-east-1"
    useSSL: false
    verifySSL: false

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

### Create Image Pull Secret (if using private registry)

```bash
kubectl create namespace s3-manager

kubectl create secret docker-registry registry-secret \
  --namespace s3-manager \
  --docker-server=yourregistry.azurecr.io \
  --docker-username=your-username \
  --docker-password=your-password
```

## Step 5: Deploy to Kubernetes (5 minutes)

### Deploy with Helm

```bash
# Create namespace
kubectl create namespace s3-manager

# Install application
helm install s3-manager ./helm/s3-manager \
  -f values-production.yaml \
  -n s3-manager

# Watch deployment
kubectl get pods -n s3-manager -w
```

### Verify Deployment

```bash
# Check pod status
kubectl get pods -n s3-manager

# Check logs
kubectl logs -n s3-manager -l app.kubernetes.io/name=s3-manager

# Check ingress
kubectl get ingress -n s3-manager

# Test health endpoint
kubectl port-forward -n s3-manager svc/s3-manager 8080:80
curl http://localhost:8080/health
```

Expected output:
```json
{"service":"S3 Manager","status":"healthy"}
```

## Step 6: Configure DNS (5 minutes)

### Get Ingress IP

```bash
kubectl get ingress -n s3-manager s3-manager \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### Update DNS

Create an A record:
- **Name:** s3-manager (or your subdomain)
- **Type:** A
- **Value:** [Ingress IP from above]
- **TTL:** 300 (5 minutes)

### Verify DNS

```bash
nslookup s3-manager.your-domain.com
# or
dig s3-manager.your-domain.com
```

## Step 7: Test Application (10 minutes)

### Access Application

1. Open browser: `https://s3-manager.your-domain.com`
2. Click "Login with Microsoft"
3. Authenticate with Azure AD account
4. Grant consent if prompted
5. You should see the S3 Manager dashboard

### Test Basic Functions

1. **View Buckets:** Should list all S3 buckets
2. **Browse Objects:** Click a bucket to view objects
3. **Download File:** Click download on any object
4. **Check Permissions:** Verify role badges show your permissions

### Test Role-Based Access

1. **S3-Viewer:** Can only view and download
2. **S3-Editor:** Can also see upload buttons
3. **S3-Admin:** Can also see delete buttons

### Test PIM (if enabled)

1. Click "Request Elevated Access (PIM)"
2. Enter target role (e.g., "S3-Admin")
3. Check Azure portal for PIM activation request

## Troubleshooting

### Cannot Login

```bash
# Check logs
kubectl logs -n s3-manager -l app.kubernetes.io/name=s3-manager | grep auth

# Verify redirect URI matches exactly
echo "https://$(kubectl get ingress -n s3-manager s3-manager -o jsonpath='{.spec.rules[0].host}')/auth/callback"
```

Compare with Azure AD app registration redirect URI.

### Cannot List Buckets

```bash
# Test S3 connection from pod
kubectl exec -n s3-manager -it deployment/s3-manager -- python3 -c "
import boto3
import os
s3 = boto3.client('s3',
    endpoint_url=os.environ['S3_ENDPOINT'],
    aws_access_key_id=os.environ['S3_ACCESS_KEY'],
    aws_secret_access_key=os.environ['S3_SECRET_KEY'])
print(s3.list_buckets())
"
```

### Certificate Issues

```bash
# Check cert-manager certificate
kubectl get certificate -n s3-manager

# Check certificate details
kubectl describe certificate -n s3-manager s3-manager-tls
```

## Maintenance

### Update Application

```bash
# Build new version
docker build -t your-registry/s3-manager:1.0.1 .
docker push your-registry/s3-manager:1.0.1

# Update values.yaml with new tag
# Then upgrade
helm upgrade s3-manager ./helm/s3-manager \
  -f values-production.yaml \
  -n s3-manager
```

### Backup Configuration

```bash
# Backup Helm values
cp values-production.yaml backups/values-$(date +%Y%m%d).yaml

# Backup Kubernetes resources
kubectl get all -n s3-manager -o yaml > backup-$(date +%Y%m%d).yaml
```

### Monitor Resources

```bash
# Check resource usage
kubectl top pods -n s3-manager

# Check logs
kubectl logs -n s3-manager -l app.kubernetes.io/name=s3-manager -f
```

## Security Checklist

- [ ] Changed default secret key to secure random value
- [ ] Configured TLS/HTTPS with valid certificate
- [ ] Using private container registry with authentication
- [ ] Azure AD client secret stored securely
- [ ] S3 credentials stored as Kubernetes secret
- [ ] Network policies configured (optional)
- [ ] Resource limits set on pods
- [ ] Regular security updates scheduled
- [ ] Audit logging enabled
- [ ] Backup procedures in place

## Support

- **Documentation:** See README.md, DEPLOYMENT.md, CONFIGURATION.md
- **Issues:** https://github.com/basmulder03/s3-manager/issues
- **Validation:** Run `./validate.sh` to verify setup

## Estimated Total Time

- Azure AD Setup: ~15 minutes
- Rook-Ceph Config: ~5 minutes
- Docker Build: ~10 minutes
- Configuration: ~10 minutes
- Deployment: ~5 minutes
- DNS Setup: ~5 minutes
- Testing: ~10 minutes

**Total: ~60 minutes**
