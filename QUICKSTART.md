# Quick Start - Local Development

## 🚀 One-Command Setup

```bash
# Clone the repository
git clone <repo-url>
cd s3-manager

# Copy environment configuration
cp .env.example .env

# Start all services
docker-compose up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose ps
```

## 🌐 Access Points

| Service          | URL                                   | Credentials              |
|------------------|---------------------------------------|--------------------------|
| S3 Manager App   | http://localhost:8080                 | See test users below     |
| Keycloak Admin   | http://localhost:8090/admin           | admin / admin            |
| LocalStack (S3)  | http://localhost:4566                 | test / test              |

## 👥 Test Users

Login to S3 Manager with these pre-configured users:

| Username | Password   | Role       | Permissions           |
|----------|------------|------------|-----------------------|
| admin    | admin123   | S3-Admin   | view, write, delete   |
| editor   | editor123  | S3-Editor  | view, write           |
| viewer   | viewer123  | S3-Viewer  | view only             |

## 🔧 Common Commands

```bash
# View logs
docker-compose logs -f s3-manager
docker-compose logs -f keycloak

# Restart services
docker-compose restart s3-manager

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build
```

## 📁 Project Structure

```
s3-manager/
├── app/
│   ├── auth/                    # Authentication module
│   │   ├── __init__.py          # Auth routes and decorators
│   │   └── oidc_providers.py    # OIDC provider implementations
│   ├── s3/                      # S3 operations module
│   ├── static/                  # Frontend assets
│   │   └── js/
│   │       ├── app.js           # Main entry point
│   │       ├── types.js         # JSDoc type definitions
│   │       └── modules/         # Modular ES6 code
│   └── templates/               # HTML templates
├── scripts/
│   ├── keycloak-realm.json      # Keycloak configuration
│   └── localstack-init.sh       # LocalStack initialization
├── config.py                    # Application configuration
├── docker-compose.yml           # Local development stack
└── .env.example                 # Environment template
```

## 🎯 Development Workflow

### 1. Make Code Changes

Frontend changes (JavaScript/CSS) are hot-reloaded automatically via volume mount.

Backend changes (Python) require a container restart:
```bash
docker-compose restart s3-manager
```

### 2. Test Different User Roles

1. Logout from the app
2. Login with a different test user
3. Verify permission-based access control works

### 3. Manage Keycloak Users

1. Go to http://localhost:8090/admin
2. Login with admin / admin
3. Navigate to: s3-manager realm → Users
4. Add/edit users and assign roles

### 4. Test S3 Operations

The LocalStack container provides a local S3 service:
- Create buckets
- Upload files
- Test permissions with different users

## 🔒 Authentication Modes

### Keycloak (Default - Recommended)
```bash
OIDC_PROVIDER=keycloak
LOCAL_DEV_MODE=false
```

### Mock Mode (No Authentication)
```bash
LOCAL_DEV_MODE=true
OIDC_PROVIDER=keycloak  # ignored when LOCAL_DEV_MODE=true
```

### Azure AD (Production)
```bash
OIDC_PROVIDER=azure
LOCAL_DEV_MODE=false
# Configure Azure AD settings in .env
```

## 🐛 Troubleshooting

### "Connection refused" when logging in
**Issue:** Keycloak not ready yet  
**Solution:** Wait 30-60 seconds after `docker-compose up`, then try again

### "Invalid redirect URI"
**Issue:** Redirect URI mismatch  
**Solution:** Update `redirectUris` in `scripts/keycloak-realm.json` to match your URL

### "No permissions" after login
**Issue:** User has no roles assigned  
**Solution:** Assign a role in Keycloak admin console

### Frontend changes not reflecting
**Issue:** Browser cache  
**Solution:** Hard refresh (Ctrl+F5) or clear browser cache

### Python module not found
**Issue:** Dependencies not installed in container  
**Solution:** 
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 📚 Additional Resources

- [OIDC Setup Guide](./docs/OIDC_SETUP.md) - Detailed provider configuration
- [Environment Variables](./.env.example) - All configuration options
- [Keycloak Documentation](https://www.keycloak.org/documentation) - Official Keycloak docs

## 🎓 Next Steps

1. ✅ Get local environment running
2. ✅ Login with test users
3. ✅ Test S3 operations (upload, download, delete)
4. ✅ Explore Keycloak admin console
5. 📖 Read [OIDC_SETUP.md](./docs/OIDC_SETUP.md) for production deployment
6. 🔧 Customize roles and permissions in `config.py`
