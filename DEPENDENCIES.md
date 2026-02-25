# Dependencies Structure

This project separates production and development dependencies for optimal Docker image size and build reliability.

## Files

### requirements.txt
**Production dependencies** - Required to run the application:
```
flask==3.1.3
flask-cors==6.0.2
boto3==1.42.56
msal==1.35.0
pyjwt==2.11.0
cryptography==46.0.5
python-dotenv==1.2.1
gunicorn==25.1.0
requests==2.32.5
```

**Used by:**
- Production Dockerfile
- Development Dockerfile
- Production deployments

### requirements-dev.txt
**Development dependencies** - Only needed for local development and testing:
```
# Includes all production dependencies
-r requirements.txt

# Testing frameworks
pytest
pytest-cov
pytest-mock

# Code quality tools
black
flake8
mypy
pylint

# Development tools
ipython
ipdb
```

**Optional dependencies:**
- `moto[s3]` - In-memory S3 mocking (commented out by default)

**Used by:**
- Local development setup
- CI/CD testing pipelines
- Code quality checks

## Why This Structure?

### Smaller Docker Images
Production Dockerfile only installs `requirements.txt`:
```dockerfile
RUN pip install --no-cache-dir -r requirements.txt
```

This keeps the production image lean and fast to build.

### Faster Builds
Development dependencies (test frameworks, linters) aren't needed in containers:
- LocalStack provides real S3 API in containers
- Testing happens in CI/CD with separate images

### Version Stability
Production dependencies are pinned to specific versions for reliability. Development tools can be more flexible.

## Installation

### Production
```bash
pip install -r requirements.txt
```

### Development
```bash
# Install both production and dev dependencies
pip install -r requirements-dev.txt
```

### Docker/Podman
```bash
# Production builds use requirements.txt automatically
docker build -t s3-manager:prod .

# Development builds also use requirements.txt
docker-compose up  # or podman-compose up
```

## Moto (Optional)

Moto is commented out in `requirements-dev.txt` because:

1. **LocalStack is preferred** for local development
   - More complete S3 API implementation
   - Better matches AWS behavior
   - Runs in containers alongside the app

2. **Only needed for unit tests** without containers
   - If you need in-memory mocking
   - For CI/CD environments without Docker

3. **Version compatibility**
   - Moto versions can have breaking changes
   - Commented out to avoid build issues

### To Enable Moto

1. Edit `requirements-dev.txt`
2. Uncomment the moto line:
   ```
   moto[s3]>=5.0,<6.0
   ```
3. Install: `pip install -r requirements-dev.txt`

## CI/CD Usage

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install -r requirements-dev.txt
      
      - name: Run tests
        run: |
          pytest tests/
      
      - name: Lint
        run: |
          flake8 app/
          black --check app/
```

### Docker Build in CI

```yaml
- name: Build Docker image
  run: docker build -t s3-manager:test .
  # Only installs requirements.txt, not requirements-dev.txt
```

## Adding New Dependencies

### Production Dependency
Add to `requirements.txt`:
```bash
echo "new-package==1.0.0" >> requirements.txt
```

### Development Dependency
Add to `requirements-dev.txt`:
```bash
echo "new-dev-package==1.0.0" >> requirements-dev.txt
```

### Update Installed Packages
```bash
# Production
pip install -r requirements.txt

# Development
pip install -r requirements-dev.txt
```

## Troubleshooting

### "No matching distribution found"

**Problem:** A package version doesn't exist or isn't compatible with your Python version.

**Solution:**
```bash
# Check available versions
pip index versions package-name

# Use a version range instead of exact version
# In requirements-dev.txt:
package-name>=1.0,<2.0
```

### Build fails in Docker

**Problem:** requirements-dev.txt being used in Dockerfile

**Solution:** Ensure Dockerfile uses `requirements.txt` only:
```dockerfile
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# NOT requirements-dev.txt
```

### Missing development tools

**Problem:** Installed requirements.txt but pytest/black not available

**Solution:** Install dev requirements:
```bash
pip install -r requirements-dev.txt
```

## Best Practices

1. **Pin versions in production** (`package==1.2.3`)
2. **Use ranges in dev** (`package>=1.2,<2.0`) for flexibility
3. **Test with production requirements** before deploying
4. **Keep dev dependencies optional** - don't require them for basic development
5. **Document why dependencies exist** in comments

## Summary

- ✅ **requirements.txt** - Lean, production-ready dependencies
- ✅ **requirements-dev.txt** - Full development environment
- ✅ **No moto in production** - Uses LocalStack in containers
- ✅ **Faster Docker builds** - Only essential packages
- ✅ **Flexible development** - All tools available when needed
