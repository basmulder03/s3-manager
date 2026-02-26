# S3 Manager Deployment Guide

This guide provides step-by-step instructions for deploying S3 Manager in a Kubernetes cluster.

## Prerequisites

Before deploying, ensure you have:

1. **Kubernetes Cluster**
   - Version: 1.20 or later
   - kubectl configured and connected
   - Sufficient resources (2 vCPU, 1GB RAM minimum)

2. **Helm**
   - Version: 3.x
   - Installed and configured

3. **Rook-Ceph**
   - Deployed with RGW (S3 gateway)
   - S3 user credentials created

4. **Azure AD**
   - Tenant access
   - App registration created
   - Client secret generated

5. **Ingress Controller**
   - NGINX Ingress Controller recommended
   - Cert-manager for TLS (optional but recommended)

## Step 1: Azure AD Setup

### Create App Registration

1. Navigate to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Fill in details:
   ```
   Name: S3 Manager
   Supported account types: Single tenant
   Redirect URI: https://your-domain.com/auth/callback
   ```
4. Save the Application (client) ID and Directory (tenant) ID

### Create Client Secret

1. Go to your app registration → Certificates & secrets
2. Click "New client secret"
3. Add description and expiration
4. Save the secret value (you won't see it again!)

### Configure API Permissions

1. Go to API permissions
2. Add permissions:
   - Microsoft Graph → Delegated → User.Read
   - Microsoft Graph → Delegated → GroupMember.Read.All
3. Click "Grant admin consent"

### Create Security Groups

Create Azure AD groups for role-based access:

```bash
# Using Azure CLI
az ad group create --display-name "S3-Viewer" --mail-nickname "S3-Viewer"
az ad group create --display-name "S3-Editor" --mail-nickname "S3-Editor"
az ad group create --display-name "S3-Admin" --mail-nickname "S3-Admin"
```

Assign users to groups via Azure Portal or CLI.

## Step 2: Rook-Ceph Configuration

### Get RGW Endpoint

```bash
kubectl get svc -n rook-ceph | grep rgw
```

Example output:
```
rook-ceph-rgw-my-store   ClusterIP   10.96.123.45   <none>   8080/TCP   7d
```

The endpoint will be: `http://rook-ceph-rgw-my-store.rook-ceph.svc.cluster.local:8080`

### Create S3 User (if not exists)

```yaml
apiVersion: ceph.rook.io/v1
kind: CephObjectStoreUser
metadata:
  name: s3-manager-user
  namespace: rook-ceph
spec:
  store: my-store
  displayName: "S3 Manager User"
```

Apply:
```bash
kubectl apply -f s3-user.yaml
```

### Get S3 Credentials

```bash
# Access Key
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-s3-manager-user \
  -o jsonpath='{.data.AccessKey}' | base64 -d && echo

# Secret Key
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-s3-manager-user \
  -o jsonpath='{.data.SecretKey}' | base64 -d && echo
```

## Step 3: Prepare Helm Configuration

Create a `values-prod.yaml` file:

```yaml
replicaCount: 2

image:
  repository: your-registry.azurecr.io/s3-manager
  pullPolicy: IfNotPresent
  tag: "1.0.0"

imagePullSecrets:
  - name: acr-secret

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/ssl-protocols: "TLSv1.2 TLSv1.3"
  hosts:
    - host: s3-manager.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: s3-manager-tls
      hosts:
        - s3-manager.example.com

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

config:
  secretKey: "CHANGE-THIS-TO-A-SECURE-RANDOM-STRING"
  sessionCookieSecure: true
  
  azureAd:
    tenantId: "your-tenant-id-here"
    clientId: "your-client-id-here"
    clientSecret: "your-client-secret-here"
  
  pim:
    enabled: true
  
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
    endpoint: "http://rook-ceph-rgw-my-store.rook-ceph.svc.cluster.local:8080"
    accessKey: "your-s3-access-key"
    secretKey: "your-s3-secret-key"
    region: "us-east-1"
    useSSL: false
    verifySSL: false
```

## Step 4: Build and Push Docker Image

### Build Image

```bash
docker build -t your-registry.azurecr.io/s3-manager:1.0.0 .
```

### Push to Registry

```bash
# For Azure Container Registry
az acr login --name your-registry
docker push your-registry.azurecr.io/s3-manager:1.0.0

# For Docker Hub
docker login
docker tag s3-manager:1.0.0 your-dockerhub/s3-manager:1.0.0
docker push your-dockerhub/s3-manager:1.0.0
```

### Create Image Pull Secret (for private registry)

```bash
kubectl create secret docker-registry acr-secret \
  --namespace s3-manager \
  --docker-server=your-registry.azurecr.io \
  --docker-username=your-username \
  --docker-password=your-password
```

## Step 5: Deploy with Helm

### Create Namespace

```bash
kubectl create namespace s3-manager
```

### Install Chart

```bash
helm install s3-manager ./helm/s3-manager \
  -f values-prod.yaml \
  -n s3-manager
```

### Verify Deployment

```bash
# Check pods
kubectl get pods -n s3-manager

# Check services
kubectl get svc -n s3-manager

# Check ingress
kubectl get ingress -n s3-manager

# View logs
kubectl logs -n s3-manager -l app.kubernetes.io/name=s3-manager
```

## Step 6: Configure DNS

Point your domain to the ingress controller's external IP:

```bash
# Get ingress IP
kubectl get ingress -n s3-manager s3-manager -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Create an A record:
```
s3-manager.example.com → <ingress-ip>
```

## Step 7: Test Application

1. Navigate to https://s3-manager.example.com
2. Click "Login with Microsoft"
3. Authenticate with your Azure AD account
4. Verify you can see S3 buckets
5. Test downloading a file
6. If you have write permissions, test uploading
7. If you have delete permissions, test deletion

## Step 8: Configure Monitoring (Optional)

### Add Prometheus Annotations

```yaml
podAnnotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

### Set up Grafana Dashboard

Create a dashboard to monitor:
- Request rate
- Response time
- Error rate
- S3 operation latency

## Upgrade

To upgrade the deployment:

```bash
# Update values
vim values-prod.yaml

# Upgrade release
helm upgrade s3-manager ./helm/s3-manager \
  -f values-prod.yaml \
  -n s3-manager

# Check rollout status
kubectl rollout status deployment/s3-manager -n s3-manager
```

## Rollback

If something goes wrong:

```bash
# List revisions
helm history s3-manager -n s3-manager

# Rollback to previous revision
helm rollback s3-manager -n s3-manager

# Or rollback to specific revision
helm rollback s3-manager 2 -n s3-manager
```

## Uninstall

To remove the application:

```bash
helm uninstall s3-manager -n s3-manager
kubectl delete namespace s3-manager
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod -n s3-manager <pod-name>

# Check logs
kubectl logs -n s3-manager <pod-name>

# Check events
kubectl get events -n s3-manager --sort-by='.lastTimestamp'
```

### Authentication not working

1. Verify Azure AD configuration:
   ```bash
   kubectl get secret -n s3-manager s3-manager -o yaml
   ```

2. Check redirect URI matches:
   - Azure AD: Must be exact match
   - Include protocol (https://)
   - Check path (/auth/callback)

3. Verify API permissions granted

### S3 connection issues

```bash
# Test S3 endpoint from pod
kubectl exec -it -n s3-manager <pod-name> -- bash
curl -v http://rook-ceph-rgw-my-store.rook-ceph.svc.cluster.local:8080
```

### Ingress not working

```bash
# Check ingress status
kubectl describe ingress -n s3-manager s3-manager

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Verify cert-manager certificate
kubectl get certificate -n s3-manager
```

## Production Best Practices

1. **Use External Secrets**: Integrate with Azure Key Vault or HashiCorp Vault
2. **Enable Pod Security Policies**: Restrict container capabilities
3. **Configure Resource Limits**: Set appropriate CPU/memory limits
4. **Enable Network Policies**: Restrict pod-to-pod communication
5. **Set up Backup**: Regular backup of configuration and secrets
6. **Enable Audit Logging**: Track all S3 operations
7. **Configure Rate Limiting**: Protect against abuse
8. **Use Multiple Replicas**: Ensure high availability
9. **Monitor and Alert**: Set up monitoring and alerting
10. **Regular Updates**: Keep dependencies and base images updated
