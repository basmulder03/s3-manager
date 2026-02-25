# Local Development Guide

This guide explains how to run the S3 Manager application locally for development and debugging purposes.

## Overview

The S3 Manager can be run locally in two ways:

1. **Docker Compose**: Complete local environment with LocalStack (S3 emulator)
2. **Direct Python**: Run the Flask app directly against LocalStack or mock S3
3. **Local Kubernetes**: Deploy to local k8s cluster (minikube, kind, k3s)

## Prerequisites

- Python 3.12+ (for direct Python execution)
- Docker and Docker Compose (for containerized setup)
- kubectl and a local Kubernetes cluster (for k8s setup)

## Option 1: Docker Compose (Recommended)

This is the easiest way to get started. It runs the entire stack including LocalStack S3.

### Setup

1. **Start the services:**
   ```bash
   docker-compose up
   ```

   This will start:
   - LocalStack S3 service on port 4566
   - S3 Manager application on port 8080

2. **Access the application:**
   - Application: http://localhost:8080
   - LocalStack S3 endpoint: http://localhost:4566

3. **Default credentials:**
   - **User**: Local Developer (dev@localhost)
   - **Role**: S3-Admin (full permissions)
   - **S3 Access Key**: test
   - **S3 Secret Key**: test

### Pre-configured Buckets

The LocalStack initialization script creates three test buckets:
- `test-bucket` - Empty bucket for testing
- `demo-bucket` - Contains sample files and folder structure
- `uploads` - Empty bucket for upload testing

### Development Workflow

The Docker Compose setup includes hot-reload, so code changes are reflected immediately:

```bash
# Edit files in ./app/
# Changes are automatically picked up
# Refresh browser to see updates
```

### Stopping Services

```bash
# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes (resets all data)
docker-compose down -v
```

## Option 2: Direct Python Execution

Run the Flask app directly on your machine for easier debugging.

### Setup

1. **Create and activate virtual environment:**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start LocalStack (in a separate terminal):**
   ```bash
   docker run --rm -d \
     -p 4566:4566 \
     -e SERVICES=s3 \
     --name localstack \
     localstack/localstack:latest
   ```

4. **Create test buckets:**
   ```bash
   # Install AWS CLI if not already installed
   pip install awscli-local
   
   # Create buckets
   awslocal s3 mb s3://test-bucket
   awslocal s3 mb s3://demo-bucket
   awslocal s3 mb s3://uploads
   ```

5. **Configure environment:**
   ```bash
   # Copy the local development environment file
   cp .env.local .env
   ```

6. **Run the application:**
   ```bash
   python run.py
   ```

7. **Access the application:**
   - Application: http://localhost:8080
   - You'll be automatically logged in as "Local Developer"

### Debugging with VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Flask",
      "type": "debugpy",
      "request": "launch",
      "module": "flask",
      "env": {
        "FLASK_APP": "run.py",
        "FLASK_DEBUG": "1",
        "LOCAL_DEV_MODE": "true"
      },
      "args": [
        "run",
        "--no-debugger",
        "--no-reload"
      ],
      "jinja": true,
      "console": "integratedTerminal"
    }
  ]
}
```

### Alternative: Using Moto (In-Memory S3)

For unit testing or when you don't want to run LocalStack:

```python
# Example test setup with moto
from moto import mock_aws
import boto3

@mock_aws
def test_list_buckets():
    # Moto creates an in-memory S3 service
    conn = boto3.client('s3', region_name='us-east-1')
    conn.create_bucket(Bucket='test-bucket')
    
    # Your test code here
```

## Option 3: Local Kubernetes Cluster

Deploy to a local Kubernetes cluster for testing Helm charts and k8s-specific features.

### Prerequisites

- Local Kubernetes cluster (minikube, kind, or k3s)
- kubectl configured
- Helm 3.x

### Using minikube

1. **Start minikube:**
   ```bash
   minikube start
   ```

2. **Enable ingress (optional):**
   ```bash
   minikube addons enable ingress
   ```

3. **Build and load the image:**
   ```bash
   # Build the image
   docker build -t s3-manager:dev .
   
   # Load into minikube
   minikube image load s3-manager:dev
   ```

4. **Deploy LocalStack to minikube:**
   ```bash
   kubectl create namespace s3-manager
   kubectl apply -f k8s-local/localstack.yaml -n s3-manager
   ```

5. **Create local values file (`values-local.yaml`):**
   ```yaml
   image:
     repository: s3-manager
     tag: dev
     pullPolicy: Never  # Use locally loaded image
   
   config:
     secretKey: "dev-secret-key"
     localDevMode: true
     
     azureAd:
       tenantId: ""
       clientId: ""
       clientSecret: ""
     
     pim:
       enabled: false
     
     s3:
       endpoint: "http://localstack.s3-manager.svc.cluster.local:4566"
       accessKey: "test"
       secretKey: "test"
       region: "us-east-1"
       useSSL: false
       verifySSL: false
   
   ingress:
     enabled: true
     className: "nginx"
     hosts:
       - host: s3-manager.local
         paths:
           - path: /
             pathType: Prefix
   ```

6. **Deploy with Helm:**
   ```bash
   helm install s3-manager ./helm/s3-manager \
     -f values-local.yaml \
     -n s3-manager
   ```

7. **Access the application:**
   ```bash
   # Port-forward method
   kubectl port-forward -n s3-manager svc/s3-manager 8080:80
   # Access at http://localhost:8080
   
   # Or use minikube tunnel (if ingress enabled)
   minikube tunnel
   # Add to /etc/hosts: 127.0.0.1 s3-manager.local
   # Access at http://s3-manager.local
   ```

### Using kind

1. **Create cluster with config:**
   ```bash
   cat <<EOF | kind create cluster --config=-
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
   EOF
   ```

2. **Load image to kind:**
   ```bash
   docker build -t s3-manager:dev .
   kind load docker-image s3-manager:dev
   ```

3. **Follow similar deployment steps as minikube**

### Using k3s

1. **Install k3s:**
   ```bash
   curl -sfL https://get.k3s.io | sh -
   ```

2. **Build and import image:**
   ```bash
   docker build -t s3-manager:dev .
   docker save s3-manager:dev | sudo k3s ctr images import -
   ```

3. **Deploy using kubectl/Helm as above**

## Environment Variables Reference

### Local Development Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_DEV_MODE` | `false` | Enables mock authentication (bypasses Azure AD) |
| `FLASK_DEBUG` | `false` | Enables Flask debug mode with hot reload |
| `DEFAULT_ROLE` | `S3-Viewer` | Default role assigned to mock user in dev mode |

### S3 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | `http://rook-ceph-rgw:8080` | S3 endpoint URL |
| `S3_ACCESS_KEY` | - | S3 access key |
| `S3_SECRET_KEY` | - | S3 secret key |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_USE_SSL` | `false` | Use SSL for S3 connections |
| `S3_VERIFY_SSL` | `false` | Verify SSL certificates |

## Testing S3 Operations

### Using AWS CLI with LocalStack

```bash
# Configure AWS CLI for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# Or use awslocal wrapper
pip install awscli-local

# List buckets
awslocal s3 ls

# Upload file
awslocal s3 cp myfile.txt s3://demo-bucket/

# Download file
awslocal s3 cp s3://demo-bucket/myfile.txt ./downloaded.txt

# List objects
awslocal s3 ls s3://demo-bucket/
```

### Using boto3 Python Script

```python
import boto3

s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:4566',
    aws_access_key_id='test',
    aws_secret_access_key='test',
    region_name='us-east-1'
)

# List buckets
buckets = s3.list_buckets()
print(buckets)

# Upload file
s3.upload_file('local-file.txt', 'demo-bucket', 'remote-file.txt')
```

## Troubleshooting

### Application won't start

**Issue**: Port 8080 already in use
```bash
# Find process using port
# Windows
netstat -ano | findstr :8080
# macOS/Linux
lsof -i :8080

# Kill process or use different port
docker-compose up
```

### Can't connect to S3/LocalStack

**Issue**: Connection refused to LocalStack
```bash
# Check if LocalStack is running
docker ps | grep localstack

# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Restart LocalStack
docker-compose restart localstack
```

### Authentication not working

**Issue**: Mock user not created in local dev mode
```bash
# Verify LOCAL_DEV_MODE is set to true
echo $LOCAL_DEV_MODE  # Should print "true"

# Check application logs
docker-compose logs s3-manager

# Restart application
docker-compose restart s3-manager
```

### Changes not reflecting

**Issue**: Code changes not showing up
```bash
# For Docker Compose: ensure volumes are mounted
docker-compose down
docker-compose up

# For direct Python: restart the app
# Press Ctrl+C and run `python run.py` again
```

## Tips for Development

1. **Use hot reload**: Both Docker Compose and Flask debug mode support hot reload
2. **Check logs**: `docker-compose logs -f s3-manager` for real-time logs
3. **Reset data**: `docker-compose down -v` removes all LocalStack data
4. **Test different roles**: Modify `DEFAULT_ROLE` in `.env.local`
5. **Debug S3 operations**: Use `FLASK_DEBUG=true` for detailed error messages

## Production vs Development

| Feature | Development | Production |
|---------|------------|------------|
| Authentication | Mock (LOCAL_DEV_MODE) | Azure AD OAuth2 |
| S3 Service | LocalStack | Rook-Ceph RGW |
| SSL/TLS | Disabled | Required |
| Debug Mode | Enabled | Disabled |
| Permissions | All (S3-Admin) | Role-based |

## Next Steps

- Read [CONFIGURATION.md](CONFIGURATION.md) for advanced configuration options
- Read [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment guide
- Check [README.md](README.md) for general project information
