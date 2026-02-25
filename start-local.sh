#!/bin/bash

# Quick start script for local development
# This script helps you get started with S3 Manager local development
# Supports Docker, Podman, and other OCI-compliant runtimes

set -e

echo "=========================================="
echo "S3 Manager - Local Development Setup"
echo "=========================================="
echo ""

# Function to detect container runtime
detect_runtime() {
    if command -v podman &> /dev/null; then
        echo "podman"
    elif command -v docker &> /dev/null; then
        echo "docker"
    else
        echo ""
    fi
}

# Function to detect compose command
detect_compose() {
    local runtime=$1
    
    if [ "$runtime" = "podman" ]; then
        if command -v podman-compose &> /dev/null; then
            echo "podman-compose"
        elif podman compose version &> /dev/null 2>&1; then
            echo "podman compose"
        else
            echo ""
        fi
    elif [ "$runtime" = "docker" ]; then
        if docker compose version &> /dev/null 2>&1; then
            echo "docker compose"
        elif command -v docker-compose &> /dev/null; then
            echo "docker-compose"
        else
            echo ""
        fi
    else
        echo ""
    fi
}

# Detect container runtime
RUNTIME=$(detect_runtime)

if [ -z "$RUNTIME" ]; then
    echo "Error: No container runtime found"
    echo "Please install one of the following:"
    echo "  - Docker (https://docs.docker.com/get-docker/)"
    echo "  - Podman (https://podman.io/getting-started/installation)"
    exit 1
fi

echo "✓ Detected container runtime: $RUNTIME"

# Detect compose command
COMPOSE_CMD=$(detect_compose "$RUNTIME")

if [ -z "$COMPOSE_CMD" ]; then
    echo "Error: No compose command found"
    if [ "$RUNTIME" = "podman" ]; then
        echo "Please install podman-compose:"
        echo "  pip install podman-compose"
        echo "Or use Podman 4.0+ with built-in compose support"
    else
        echo "Please install Docker Compose:"
        echo "  https://docs.docker.com/compose/install/"
    fi
    exit 1
fi

echo "✓ Using compose command: $COMPOSE_CMD"
echo ""

# Select appropriate compose file
if [ "$RUNTIME" = "podman" ] && [ -f "podman-compose.yml" ]; then
    COMPOSE_FILE="podman-compose.yml"
    echo "✓ Using Podman-specific compose file"
else
    COMPOSE_FILE="docker-compose.yml"
    echo "✓ Using standard compose file"
fi

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "Creating .env.local file..."
    cat > .env.local << 'EOF'
LOCAL_DEV_MODE=true
FLASK_DEBUG=true
SECRET_KEY=dev-secret-key-change-in-production
DEFAULT_ROLE=S3-Admin
S3_ENDPOINT=http://localhost:4566
S3_ACCESS_KEY=test
S3_SECRET_KEY=test
S3_REGION=us-east-1
S3_USE_SSL=false
S3_VERIFY_SSL=false
SESSION_COOKIE_SECURE=false
EOF
fi

echo ""
echo "Starting local development environment..."
echo ""
echo "This will start:"
echo "  - LocalStack S3 service on port 4566"
echo "  - S3 Manager application on port 8080"
echo ""
echo "Pre-configured test buckets:"
echo "  - test-bucket (empty)"
echo "  - demo-bucket (with sample files)"
echo "  - uploads (empty)"
echo ""
echo "You will be auto-logged in as 'Local Developer' with full permissions"
echo ""

# Start compose
if [ "$COMPOSE_CMD" = "podman-compose" ]; then
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
else
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
fi

echo ""
echo "=========================================="
echo "Services started successfully!"
echo "=========================================="
echo ""
echo "Access the application at:"
echo "  http://localhost:8080"
echo ""
echo "LocalStack S3 endpoint:"
echo "  http://localhost:4566"
echo ""
echo "View logs:"
echo "  $COMPOSE_CMD -f $COMPOSE_FILE logs -f"
echo ""
echo "Stop services:"
echo "  $COMPOSE_CMD -f $COMPOSE_FILE down"
echo ""
echo "Stop and remove data:"
echo "  $COMPOSE_CMD -f $COMPOSE_FILE down -v"
echo ""
echo "Waiting for services to be ready..."

# Wait for services to be healthy
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; then
        echo "✓ LocalStack is ready!"
        break
    fi
    echo "  Waiting for LocalStack... ($((attempt + 1))/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    echo "Warning: LocalStack did not become ready in time"
    echo "You can check logs with: $COMPOSE_CMD -f $COMPOSE_FILE logs localstack"
fi

attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8080/auth/user > /dev/null 2>&1; then
        echo "✓ S3 Manager is ready!"
        echo ""
        echo "=========================================="
        echo "Ready! Open http://localhost:8080"
        echo "=========================================="
        exit 0
    fi
    echo "  Waiting for S3 Manager... ($((attempt + 1))/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

echo "Warning: S3 Manager did not become ready in time"
echo "You can check logs with: $COMPOSE_CMD -f $COMPOSE_FILE logs s3-manager"
echo ""
echo "The services are running. Try accessing http://localhost:8080"
