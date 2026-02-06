from flask import Blueprint, redirect, url_for, session, request, jsonify, current_app
import msal
import requests
import jwt
from functools import wraps

auth_bp = Blueprint('auth', __name__)

def get_msal_app():
    """Create MSAL confidential client application"""
    return msal.ConfidentialClientApplication(
        current_app.config['AZURE_AD_CLIENT_ID'],
        authority=current_app.config['AZURE_AD_AUTHORITY'],
        client_credential=current_app.config['AZURE_AD_CLIENT_SECRET']
    )

def login_required(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def permission_required(permission):
    """Decorator to check if user has required permission"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user' not in session:
                return jsonify({'error': 'Authentication required'}), 401
            
            user_permissions = session['user'].get('permissions', [])
            if permission not in user_permissions:
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def get_user_roles(access_token):
    """Fetch user roles from Microsoft Graph API"""
    headers = {'Authorization': f'Bearer {access_token}'}
    
    try:
        # Get user's group memberships
        graph_url = 'https://graph.microsoft.com/v1.0/me/memberOf'
        response = requests.get(graph_url, headers=headers)
        
        if response.status_code == 200:
            groups = response.json().get('value', [])
            # Extract display names of groups
            return [group.get('displayName') for group in groups if 'displayName' in group]
    except Exception as e:
        current_app.logger.error(f"Error fetching user roles: {e}")
    
    return []

def map_roles_to_permissions(roles):
    """Map Microsoft Entra roles to application permissions"""
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
    """Initiate Azure AD login"""
    msal_app = get_msal_app()
    
    # Build authorization URL
    redirect_uri = url_for('auth.callback', _external=True)
    auth_url = msal_app.get_authorization_request_url(
        scopes=current_app.config['AZURE_AD_SCOPES'],
        redirect_uri=redirect_uri
    )
    
    return redirect(auth_url)

@auth_bp.route('/callback')
def callback():
    """Handle Azure AD callback"""
    if 'code' not in request.args:
        return jsonify({'error': 'No authorization code received'}), 400
    
    msal_app = get_msal_app()
    redirect_uri = url_for('auth.callback', _external=True)
    
    # Acquire token
    result = msal_app.acquire_token_by_authorization_code(
        request.args['code'],
        scopes=current_app.config['AZURE_AD_SCOPES'],
        redirect_uri=redirect_uri
    )
    
    if 'error' in result:
        return jsonify({'error': result.get('error_description', 'Authentication failed')}), 400
    
    # Decode ID token to get user info
    id_token = result.get('id_token')
    access_token = result.get('access_token')
    
    try:
        # Decode without verification for demo (in production, verify the signature)
        user_info = jwt.decode(id_token, options={"verify_signature": False})
        
        # Fetch user roles
        roles = get_user_roles(access_token)
        permissions = map_roles_to_permissions(roles)
        
        # Store user session
        session['user'] = {
            'name': user_info.get('name', 'Unknown User'),
            'email': user_info.get('preferred_username', ''),
            'roles': roles,
            'permissions': permissions,
            'access_token': access_token
        }
        session.permanent = True
        
        return redirect('/')
    except Exception as e:
        current_app.logger.error(f"Error processing authentication: {e}")
        return jsonify({'error': 'Failed to process authentication'}), 500

@auth_bp.route('/logout')
def logout():
    """Logout user"""
    session.clear()
    logout_url = f"{current_app.config['AZURE_AD_AUTHORITY']}/oauth2/v2.0/logout"
    return redirect(logout_url)

@auth_bp.route('/user')
@login_required
def get_user():
    """Get current user information"""
    user = session.get('user', {})
    return jsonify({
        'name': user.get('name'),
        'email': user.get('email'),
        'roles': user.get('roles', []),
        'permissions': user.get('permissions', [])
    })

@auth_bp.route('/pim/elevate', methods=['POST'])
@login_required
def elevate_privileges():
    """Request privilege elevation via PIM"""
    if not current_app.config['PIM_ENABLED']:
        return jsonify({'error': 'PIM is not enabled'}), 400
    
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
