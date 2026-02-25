import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Local Development Mode
    # When enabled, bypasses OIDC authentication with a mock user
    LOCAL_DEV_MODE = os.environ.get('LOCAL_DEV_MODE', 'false').lower() == 'true'
    
    # OIDC Provider Configuration
    # Supported providers: 'azure', 'keycloak', 'google'
    OIDC_PROVIDER = os.environ.get('OIDC_PROVIDER', 'keycloak')
    
    # Microsoft Entra ID (Azure AD) Configuration
    AZURE_AD_TENANT_ID = os.environ.get('AZURE_AD_TENANT_ID', '')
    AZURE_AD_CLIENT_ID = os.environ.get('AZURE_AD_CLIENT_ID', '')
    AZURE_AD_CLIENT_SECRET = os.environ.get('AZURE_AD_CLIENT_SECRET', '')
    AZURE_AD_AUTHORITY = f"https://login.microsoftonline.com/{AZURE_AD_TENANT_ID}" if AZURE_AD_TENANT_ID else ""
    AZURE_AD_SCOPES = ["User.Read"]
    
    # Keycloak Configuration
    KEYCLOAK_SERVER_URL = os.environ.get('KEYCLOAK_SERVER_URL', 'http://keycloak:8080')
    KEYCLOAK_REALM = os.environ.get('KEYCLOAK_REALM', 's3-manager')
    KEYCLOAK_CLIENT_ID = os.environ.get('KEYCLOAK_CLIENT_ID', 's3-manager-client')
    KEYCLOAK_CLIENT_SECRET = os.environ.get('KEYCLOAK_CLIENT_SECRET', 'your-keycloak-client-secret')
    KEYCLOAK_SCOPES = os.environ.get('KEYCLOAK_SCOPES', 'openid profile email')
    
    # Google OAuth Configuration
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_SCOPES = os.environ.get('GOOGLE_SCOPES', 'openid profile email')
    # Map email domains to roles for Google auth (since Google doesn't provide groups by default)
    GOOGLE_DOMAIN_ROLES = {
        # Example: 'yourcompany.com': ['S3-Admin']
    }
    
    # Generic OIDC redirect path
    OIDC_REDIRECT_PATH = "/auth/callback"
    
    # PIM Configuration
    PIM_ENABLED = os.environ.get('PIM_ENABLED', 'false').lower() == 'true'
    PIM_ROLE_ASSIGNMENT_API = "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments"
    
    # Role-based permissions configuration
    # Format: role_name: permissions (view, write, delete)
    ROLE_PERMISSIONS = {
        'S3-Viewer': ['view'],
        'S3-Editor': ['view', 'write'],
        'S3-Admin': ['view', 'write', 'delete']
    }
    
    # Default role for authenticated users
    DEFAULT_ROLE = os.environ.get('DEFAULT_ROLE', 'S3-Viewer')
    
    # S3/Rook-Ceph Configuration
    S3_ENDPOINT = os.environ.get('S3_ENDPOINT', 'http://rook-ceph-rgw:8080')
    S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY', '')
    S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY', '')
    S3_REGION = os.environ.get('S3_REGION', 'us-east-1')
    S3_USE_SSL = os.environ.get('S3_USE_SSL', 'false').lower() == 'true'
    S3_VERIFY_SSL = os.environ.get('S3_VERIFY_SSL', 'false').lower() == 'true'
    
    # Application Configuration
    APP_NAME = "S3 Manager"
    APP_VERSION = "1.0.0"
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour
