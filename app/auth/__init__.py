from flask import Blueprint, redirect, url_for, session, request, jsonify, current_app
import secrets
from functools import wraps
from .oidc_providers import get_oidc_provider

auth_bp = Blueprint('auth', __name__)

def is_local_dev_mode():
    """Check if running in local development mode"""
    return current_app.config.get('LOCAL_DEV_MODE', False)

def create_mock_user():
    """Create a mock user for local development"""
    default_role = current_app.config.get('DEFAULT_ROLE', 'S3-Admin')
    role_permissions = current_app.config.get('ROLE_PERMISSIONS', {})
    
    permissions = role_permissions.get(default_role, ['view', 'write', 'delete'])
    
    return {
        'name': 'Local Developer',
        'email': 'dev@localhost',
        'roles': [default_role],
        'permissions': permissions,
        'access_token': 'mock_token_for_local_dev'
    }

def get_oidc_provider_instance():
    """
    Get the configured OIDC provider instance
    
    Returns:
        OIDCProvider instance or None if in local dev mode
    """
    if is_local_dev_mode():
        return None
    
    provider_type = current_app.config.get('OIDC_PROVIDER', 'keycloak')
    
    # Build provider config based on type
    if provider_type in ['azure', 'azuread']:
        config = {
            'client_id': current_app.config['AZURE_AD_CLIENT_ID'],
            'client_secret': current_app.config['AZURE_AD_CLIENT_SECRET'],
            'authority': current_app.config['AZURE_AD_AUTHORITY'],
            'scopes': current_app.config['AZURE_AD_SCOPES']
        }
    elif provider_type == 'keycloak':
        config = {
            'server_url': current_app.config['KEYCLOAK_SERVER_URL'],
            'realm': current_app.config['KEYCLOAK_REALM'],
            'client_id': current_app.config['KEYCLOAK_CLIENT_ID'],
            'client_secret': current_app.config['KEYCLOAK_CLIENT_SECRET'],
            'scopes': current_app.config['KEYCLOAK_SCOPES']
        }
    elif provider_type == 'google':
        config = {
            'client_id': current_app.config['GOOGLE_CLIENT_ID'],
            'client_secret': current_app.config['GOOGLE_CLIENT_SECRET'],
            'scopes': current_app.config['GOOGLE_SCOPES'],
            'domain_roles': current_app.config.get('GOOGLE_DOMAIN_ROLES', {})
        }
    else:
        raise ValueError(f"Unsupported OIDC provider: {provider_type}")
    
    return get_oidc_provider(provider_type, config)

def login_required(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # In local dev mode, auto-login with mock user
        if is_local_dev_mode() and 'user' not in session:
            session['user'] = create_mock_user()
            session.permanent = True
        
        if 'user' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def permission_required(permission):
    """Decorator to check if user has required permission"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # In local dev mode, auto-login with mock user
            if is_local_dev_mode() and 'user' not in session:
                session['user'] = create_mock_user()
                session.permanent = True
            
            if 'user' not in session:
                return jsonify({'error': 'Authentication required'}), 401
            
            user_permissions = session['user'].get('permissions', [])
            if permission not in user_permissions:
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def map_roles_to_permissions(roles):
    """Map provider roles to application permissions"""
    permissions = set()
    role_permissions = current_app.config['ROLE_PERMISSIONS']
    
    for role in roles:
        if role in role_permissions:
            permissions.update(role_permissions[role])
    
    # If no roles matched, assign default role permissions
    if not permissions:
        default_role = current_app.config['DEFAULT_ROLE']
        if default_role in role_permissions:
            permissions.update(role_permissions[default_role])
    
    return list(permissions)

@auth_bp.route('/login')
def login():
    """Initiate OIDC login flow"""
    # In local dev mode, create mock session and redirect
    if is_local_dev_mode():
        session['user'] = create_mock_user()
        session.permanent = True
        return redirect('/')
    
    try:
        provider = get_oidc_provider_instance()
        
        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)
        session['oauth_state'] = state
        
        # Build redirect URI
        redirect_uri = url_for('auth.callback', _external=True)
        
        # Get authorization URL from provider
        auth_url = provider.get_authorization_url(redirect_uri, state)
        
        return redirect(auth_url)
    except Exception as e:
        current_app.logger.error(f"Error initiating login: {e}")
        return jsonify({'error': 'Failed to initiate login'}), 500

@auth_bp.route('/callback')
def callback():
    """Handle OIDC callback"""
    # In local dev mode, just redirect to home
    if is_local_dev_mode():
        return redirect('/')
    
    try:
        # Verify state for CSRF protection
        state = request.args.get('state')
        if not state or state != session.get('oauth_state'):
            return jsonify({'error': 'Invalid state parameter'}), 400
        
        # Clear the state from session
        session.pop('oauth_state', None)
        
        # Check for authorization code
        if 'code' not in request.args:
            error = request.args.get('error', 'No authorization code received')
            error_description = request.args.get('error_description', '')
            current_app.logger.error(f"OAuth error: {error} - {error_description}")
            return jsonify({'error': error_description or error}), 400
        
        provider = get_oidc_provider_instance()
        redirect_uri = url_for('auth.callback', _external=True)
        
        # Exchange code for tokens
        token_result = provider.exchange_code_for_token(
            request.args['code'],
            redirect_uri
        )
        
        access_token = token_result.get('access_token')
        
        # Store id_token in provider config if available (for Azure AD)
        if 'id_token' in token_result:
            provider.config['id_token'] = token_result['id_token']
        
        # Get user information
        user_info = provider.get_user_info(access_token)
        
        # Get user roles from provider
        roles = provider.get_user_roles(access_token, user_info)
        
        # Map roles to permissions
        permissions = map_roles_to_permissions(roles)
        
        # Extract user details (handle different provider formats)
        name = user_info.get('name') or user_info.get('preferred_username') or user_info.get('email', 'Unknown User')
        email = user_info.get('email') or user_info.get('preferred_username', '')
        
        # Store user session
        session['user'] = {
            'name': name,
            'email': email,
            'roles': roles,
            'permissions': permissions,
            'access_token': access_token,
            'provider': current_app.config.get('OIDC_PROVIDER')
        }
        session.permanent = True
        
        return redirect('/')
        
    except Exception as e:
        current_app.logger.error(f"Error processing authentication callback: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to process authentication: {str(e)}'}), 500

@auth_bp.route('/logout')
def logout():
    """Logout user"""
    provider_type = session.get('user', {}).get('provider')
    
    # Clear session
    session.clear()
    
    # In local dev mode, just redirect to login
    if is_local_dev_mode():
        return redirect(url_for('auth.login'))
    
    try:
        # Get provider logout URL
        provider = get_oidc_provider_instance()
        logout_url = provider.get_logout_url(url_for('index', _external=True))
        
        return redirect(logout_url)
    except Exception as e:
        current_app.logger.error(f"Error during logout: {e}")
        # Fallback to home page
        return redirect('/')

@auth_bp.route('/user')
@login_required
def get_user():
    """Get current user information"""
    user = session.get('user', {})
    return jsonify({
        'name': user.get('name'),
        'email': user.get('email'),
        'roles': user.get('roles', []),
        'permissions': user.get('permissions', []),
        'provider': user.get('provider', 'local'),
        'localDevMode': is_local_dev_mode()
    })

@auth_bp.route('/pim/elevate', methods=['POST'])
@login_required
def elevate_privileges():
    """Request privilege elevation via PIM (Azure AD specific)"""
    if not current_app.config['PIM_ENABLED']:
        return jsonify({'error': 'PIM is not enabled'}), 400
    
    # PIM is Azure AD specific
    if current_app.config.get('OIDC_PROVIDER') not in ['azure', 'azuread']:
        return jsonify({'error': 'PIM is only available with Azure AD'}), 400
    
    data = request.get_json()
    requested_role = data.get('role')
    
    if not requested_role:
        return jsonify({'error': 'Role is required'}), 400
    
    # In a real implementation, this would:
    # 1. Make a request to Azure PIM API to activate a role
    # 2. Wait for approval or automatic activation
    # 3. Update the user's session with new permissions
    
    # For now, we'll simulate this process
    return jsonify({
        'message': 'PIM elevation request submitted',
        'role': requested_role,
        'status': 'pending'
    })
