# Local Access URLs

All services are accessible via `kubectl port-forward`.

## Access Method

### Port Forwarding (Required)

Open three separate terminal windows and run these commands:

```powershell
# Terminal 1 - S3 Manager
kubectl port-forward -n s3-manager-test svc/s3-manager 9080:80

# Terminal 2 - Keycloak
kubectl port-forward -n keycloak svc/keycloak 9081:80

# Terminal 3 - LocalStack  
kubectl port-forward -n localstack svc/localstack 9082:4566
```

Then access:
- **S3 Manager**: http://localhost:9080
- **Keycloak**: http://localhost:9081
- **LocalStack**: http://localhost:9082

### S3 Manager Application
**URL**: http://localhost:9080

Main application for managing S3 buckets and objects.

### Keycloak (Authentication)
**URL**: http://localhost:9081

Admin Console: http://localhost:9081/admin
- Username: `admin`
- Password: `admin`

Realm: `s3-manager`
Client: `s3-manager-client`

### LocalStack S3 API
**URL**: http://localhost:9082

AWS CLI Example:
```bash
aws --endpoint-url=http://localhost:9082 s3 ls
```

Credentials (default for LocalStack):
- Access Key: `test`
- Secret Key: `test`

---

## Testing the Setup

### 1. Test LocalStack S3
```bash
# List buckets
aws --endpoint-url=http://localhost:9082 s3 ls

# Create a test bucket
aws --endpoint-url=http://localhost:9082 s3 mb s3://my-test-bucket

# Upload a file
echo "Hello from LocalStack" > test.txt
aws --endpoint-url=http://localhost:9082 s3 cp test.txt s3://my-test-bucket/

# List objects
aws --endpoint-url=http://localhost:9082 s3 ls s3://my-test-bucket/
```

### 2. Test Keycloak
Open http://localhost:9081 in your browser and log in with admin/admin

### 3. Test S3 Manager
Open http://localhost:9080 in your browser

---

## Service Details

| Service | Internal Port | Port Forward | URL |
|---------|--------------|--------------|-----|
| S3 Manager | 80 | 9080 | http://localhost:9080 |
| Keycloak | 8080 | 9081 | http://localhost:9081 |
| LocalStack | 4566 | 9082 | http://localhost:9082 |

---

## Architecture

```
┌─────────────────┐
│   S3 Manager    │ ← http://localhost:9080
│  (Port Forward) │
└────────┬────────┘
         │
         ├─→ Keycloak (Port Forward)   ← Authentication
         │   http://localhost:9081
         │
         └─→ LocalStack (Port Forward) ← S3 Storage
             http://localhost:9082
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
