#!/bin/bash

# Quick start script for local development
# This script helps you get started with S3 Manager local development

set -e

echo "=========================================="
echo "S3 Manager - Local Development Setup"
echo "=========================================="
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: docker-compose or 'docker compose' command not found"
    echo "Please install Docker and Docker Compose first"
    exit 1
fi

# Determine docker compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

echo "Using Docker Compose command: $DOCKER_COMPOSE"
echo ""

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "Creating .env.local file..."
    cp .env.local .env.local 2>/dev/null || echo "Warning: Could not copy .env.local template"
fi

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

# Start docker-compose
$DOCKER_COMPOSE up -d

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
echo "  $DOCKER_COMPOSE logs -f"
echo ""
echo "Stop services:"
echo "  $DOCKER_COMPOSE down"
echo ""
echo "Stop and remove data:"
echo "  $DOCKER_COMPOSE down -v"
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
    echo "You can check logs with: $DOCKER_COMPOSE logs localstack"
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
echo "You can check logs with: $DOCKER_COMPOSE logs s3-manager"
echo ""
echo "The services are running. Try accessing http://localhost:8080"
