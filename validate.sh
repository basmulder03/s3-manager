#!/bin/bash
# Validation script for S3 Manager

set -e

echo "=== S3 Manager Validation ==="
echo

# Check required files
echo "✓ Checking project structure..."
required_files=(
    "Dockerfile"
    "requirements.txt"
    "config.py"
    "run.py"
    "app/__init__.py"
    "app/auth/__init__.py"
    "app/s3/__init__.py"
    "app/views.py"
    "helm/s3-manager/Chart.yaml"
    "helm/s3-manager/values.yaml"
    "README.md"
    "DEPLOYMENT.md"
    "CONFIGURATION.md"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "✗ Missing: $file"
        exit 1
    fi
done
echo "✓ All required files present"
echo

# Check Python syntax
echo "✓ Checking Python syntax..."
python3 -m py_compile app/__init__.py app/auth/__init__.py app/s3/__init__.py app/views.py config.py run.py
echo "✓ Python syntax valid"
echo

# Validate Helm chart
echo "✓ Validating Helm chart..."
helm lint helm/s3-manager
echo "✓ Helm chart valid"
echo

# Test Helm template rendering
echo "✓ Testing Helm template rendering..."
helm template s3-manager helm/s3-manager > /dev/null
echo "✓ Helm templates render correctly"
echo

# Check Docker build
echo "✓ Testing Docker build..."
if docker build -t s3-manager:test . > /tmp/docker-build.log 2>&1; then
    echo "✓ Docker image builds successfully"
else
    echo "✗ Docker build failed. See /tmp/docker-build.log for details"
    tail -20 /tmp/docker-build.log
    exit 1
fi
echo

# Check image size
echo "✓ Docker image information:"
docker images s3-manager:test --format "Size: {{.Size}}"
echo

echo "=== Validation Complete ==="
echo "All checks passed! ✓"
