# Local Access URLs

All services are now accessible via NodePort on your localhost:

## Access Methods

### Direct Access via NodePort (Fixed Ports)

These ports are always available:
- **S3 Manager**: http://localhost:30080
- **Keycloak**: http://localhost:30081  
- **LocalStack**: http://localhost:30082

### Port Forwarding (If NodePort doesn't work)

If the NodePort services don't work after laptop sleep/Docker restart:

```powershell
# S3 Manager
kubectl port-forward -n s3-manager-test svc/s3-manager 9080:80

# Keycloak
kubectl port-forward -n keycloak svc/keycloak 9081:80

# LocalStack  
kubectl port-forward -n localstack svc/localstack 9082:4566
```

Then access at http://localhost:9080, http://localhost:9081, http://localhost:9082

### S3 Manager Application
**URL**: http://localhost:30080

Main application for managing S3 buckets and objects.

### Keycloak (Authentication)
**URL**: http://localhost:30081

Admin Console: http://localhost:30081/admin
- Username: `admin`
- Password: `admin`

Realm: `s3-manager`
Client: `s3-manager-client`

### LocalStack S3 API
**URL**: http://localhost:30082

AWS CLI Example:
```bash
aws --endpoint-url=http://localhost:30082 s3 ls
```

Credentials (default for LocalStack):
- Access Key: `test`
- Secret Key: `test`

---

## Testing the Setup

### 1. Test LocalStack S3
```bash
# List buckets
aws --endpoint-url=http://localhost:30082 s3 ls

# Create a test bucket
aws --endpoint-url=http://localhost:30082 s3 mb s3://my-test-bucket

# Upload a file
echo "Hello from LocalStack" > test.txt
aws --endpoint-url=http://localhost:30082 s3 cp test.txt s3://my-test-bucket/

# List objects
aws --endpoint-url=http://localhost:30082 s3 ls s3://my-test-bucket/
```

### 2. Test Keycloak
Open http://localhost:30081 in your browser and log in with admin/admin

### 3. Test S3 Manager
Open http://localhost:30080 in your browser

---

## Port Mappings

| Service | Internal Port | NodePort | URL |
|---------|--------------|----------|-----|
| S3 Manager | 80 | 30080 | http://localhost:30080 |
| Keycloak | 8080 | 30081 | http://localhost:30081 |
| LocalStack | 4566 | 30082 | http://localhost:30082 |

---

## Architecture

```
┌─────────────────┐
│   S3 Manager    │ ← http://localhost:30080
│  (Port 30080)   │
└────────┬────────┘
         │
         ├─→ Keycloak (Port 30081)     ← Authentication
         │   http://localhost:30081
         │
         └─→ LocalStack (Port 30082)   ← S3 Storage
             http://localhost:30082
```

## Troubleshooting

### Check pod status
```bash
kubectl get pods -A | grep -E "(s3-manager|keycloak|localstack)"
```

### View logs
```bash
# S3 Manager logs
kubectl logs -n s3-manager-test -l app=s3-manager --tail=50

# Keycloak logs
kubectl logs -n keycloak -l app=keycloak --tail=50

# LocalStack logs
kubectl logs -n localstack -l app=localstack --tail=50
```

### Restart services
```bash
# Restart S3 Manager
kubectl rollout restart deployment/s3-manager -n s3-manager-test

# Restart Keycloak
kubectl rollout restart deployment/keycloak -n keycloak

# Restart LocalStack
kubectl rollout restart deployment/localstack -n localstack
```
