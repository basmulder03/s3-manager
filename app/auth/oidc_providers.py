"""
OIDC Provider Abstraction Layer
Supports multiple OIDC providers (Azure AD, Keycloak, Google, Okta, etc.)
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import requests
from flask import current_app


class OIDCProvider(ABC):
    """Abstract base class for OIDC providers"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize OIDC provider with configuration
        
        Args:
            config: Dictionary containing provider-specific configuration
        """
        self.config = config
    
    @abstractmethod
    def get_authorization_url(self, redirect_uri: str, state: str) -> str:
        """
        Get the authorization URL for OAuth2 flow
        
        Args:
            redirect_uri: Redirect URI after authentication
            state: State parameter for CSRF protection
            
        Returns:
            Authorization URL string
        """
        pass
    
    @abstractmethod
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access token
        
        Args:
            code: Authorization code from callback
            redirect_uri: Redirect URI used in authorization request
            
        Returns:
            Dictionary containing tokens and user info
        """
        pass
    
    @abstractmethod
    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user information from the provider
        
        Args:
            access_token: Access token
            
        Returns:
            Dictionary containing user information
        """
        pass
    
    @abstractmethod
    def get_user_roles(self, access_token: str, user_info: Dict[str, Any]) -> List[str]:
        """
        Get user roles/groups from the provider
        
        Args:
            access_token: Access token
            user_info: User information dictionary
            
        Returns:
            List of role/group names
        """
        pass
    
    @abstractmethod
    def get_logout_url(self, redirect_uri: Optional[str] = None) -> str:
        """
        Get the logout URL
        
        Args:
            redirect_uri: Optional redirect URI after logout
            
        Returns:
            Logout URL string
        """
        pass


class AzureADProvider(OIDCProvider):
    """Microsoft Azure AD / Entra ID provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        import msal
        self.msal = msal
        self.app = msal.ConfidentialClientApplication(
            config['client_id'],
            authority=config['authority'],
            client_credential=config['client_secret']
        )
    
    def get_authorization_url(self, redirect_uri: str, state: str) -> str:
        return self.app.get_authorization_request_url(
            scopes=self.config.get('scopes', ['User.Read']),
            redirect_uri=redirect_uri,
            state=state
        )
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        result = self.app.acquire_token_by_authorization_code(
            code,
            scopes=self.config.get('scopes', ['User.Read']),
            redirect_uri=redirect_uri
        )
        
        if 'error' in result:
            raise Exception(result.get('error_description', 'Token exchange failed'))
        
        return result
    
    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        import jwt
        
        # Decode ID token (Azure AD)
        # Note: In production, verify signature with Microsoft's public keys
        id_token = self.config.get('id_token')
        if id_token:
            return jwt.decode(id_token, options={"verify_signature": False})
        
        # Fallback to Graph API
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get('https://graph.microsoft.com/v1.0/me', headers=headers)
        response.raise_for_status()
        return response.json()
    
    def get_user_roles(self, access_token: str, user_info: Dict[str, Any]) -> List[str]:
        """Fetch user roles from Microsoft Graph API"""
        headers = {'Authorization': f'Bearer {access_token}'}
        
        try:
            graph_url = 'https://graph.microsoft.com/v1.0/me/memberOf'
            response = requests.get(graph_url, headers=headers)
            
            if response.status_code == 200:
                groups = response.json().get('value', [])
                return [group.get('displayName') for group in groups if 'displayName' in group]
        except Exception as e:
            current_app.logger.error(f"Error fetching Azure AD roles: {e}")
        
        return []
    
    def get_logout_url(self, redirect_uri: Optional[str] = None) -> str:
        logout_url = f"{self.config['authority']}/oauth2/v2.0/logout"
        if redirect_uri:
            logout_url += f"?post_logout_redirect_uri={redirect_uri}"
        return logout_url


class KeycloakProvider(OIDCProvider):
    """Keycloak OIDC provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.server_url = config['server_url']
        self.realm = config['realm']
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
        self.base_url = f"{self.server_url}/realms/{self.realm}/protocol/openid-connect"
    
    def get_authorization_url(self, redirect_uri: str, state: str) -> str:
        from urllib.parse import urlencode
        
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'scope': self.config.get('scopes', 'openid profile email'),
            'state': state
        }
        
        return f"{self.base_url}/auth?{urlencode(params)}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        token_url = f"{self.base_url}/token"
        
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': self.client_id,
            'client_secret': self.client_secret
        }
        
        response = requests.post(token_url, data=data)
        response.raise_for_status()
        
        return response.json()
    
    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get user info from Keycloak userinfo endpoint"""
        userinfo_url = f"{self.base_url}/userinfo"
        headers = {'Authorization': f'Bearer {access_token}'}
        
        response = requests.get(userinfo_url, headers=headers)
        response.raise_for_status()
        
        return response.json()
    
    def get_user_roles(self, access_token: str, user_info: Dict[str, Any]) -> List[str]:
        """Extract roles from Keycloak token or userinfo"""
        import jwt
        
        # Decode access token to get roles (without verification for simplicity)
        # In production, verify the signature
        try:
            token_data = jwt.decode(access_token, options={"verify_signature": False})
            
            # Keycloak stores roles in different locations depending on configuration
            roles = []
            
            # Check realm_access roles
            if 'realm_access' in token_data:
                roles.extend(token_data['realm_access'].get('roles', []))
            
            # Check resource_access roles for this client
            if 'resource_access' in token_data and self.client_id in token_data['resource_access']:
                roles.extend(token_data['resource_access'][self.client_id].get('roles', []))
            
            # Check groups claim
            if 'groups' in token_data:
                roles.extend(token_data['groups'])
            
            # Filter out default Keycloak roles
            filtered_roles = [r for r in roles if not r.startswith('default-') and r not in ['uma_authorization', 'offline_access']]
            
            return filtered_roles
        except Exception as e:
            current_app.logger.error(f"Error extracting Keycloak roles: {e}")
            return []
    
    def get_logout_url(self, redirect_uri: Optional[str] = None) -> str:
        from urllib.parse import urlencode
        
        logout_url = f"{self.base_url}/logout"
        
        if redirect_uri:
            params = {'redirect_uri': redirect_uri}
            logout_url += f"?{urlencode(params)}"
        
        return logout_url


class GoogleProvider(OIDCProvider):
    """Google OAuth2 / OIDC provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.client_id = config['client_id']
        self.client_secret = config['client_secret']
    
    def get_authorization_url(self, redirect_uri: str, state: str) -> str:
        from urllib.parse import urlencode
        
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'redirect_uri': redirect_uri,
            'scope': self.config.get('scopes', 'openid profile email'),
            'state': state,
            'access_type': 'offline'
        }
        
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    
    def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        token_url = 'https://oauth2.googleapis.com/token'
        
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': self.client_id,
            'client_secret': self.client_secret
        }
        
        response = requests.post(token_url, data=data)
        response.raise_for_status()
        
        return response.json()
    
    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """Get user info from Google"""
        userinfo_url = 'https://www.googleapis.com/oauth2/v2/userinfo'
        headers = {'Authorization': f'Bearer {access_token}'}
        
        response = requests.get(userinfo_url, headers=headers)
        response.raise_for_status()
        
        return response.json()
    
    def get_user_roles(self, access_token: str, user_info: Dict[str, Any]) -> List[str]:
        """
        Google doesn't provide built-in roles/groups via standard OAuth2
        You would need to use Google Workspace Admin SDK for group membership
        or implement custom role mapping based on email domain, etc.
        """
        # Default: map email domain to a role
        email = user_info.get('email', '')
        domain = email.split('@')[-1] if '@' in email else ''
        
        # Example: You could configure domain-to-role mappings in config
        domain_roles = self.config.get('domain_roles', {})
        
        if domain in domain_roles:
            return domain_roles[domain]
        
        return []
    
    def get_logout_url(self, redirect_uri: Optional[str] = None) -> str:
        # Google doesn't have a standard logout endpoint for OAuth2
        # Users need to revoke access via their Google account settings
        return redirect_uri or '/'


def get_oidc_provider(provider_type: str, config: Dict[str, Any]) -> OIDCProvider:
    """
    Factory function to get the appropriate OIDC provider
    
    Args:
        provider_type: Type of provider ('azure', 'keycloak', 'google', etc.)
        config: Provider configuration dictionary
        
    Returns:
        OIDCProvider instance
        
    Raises:
        ValueError: If provider type is not supported
    """
    providers = {
        'azure': AzureADProvider,
        'azuread': AzureADProvider,
        'keycloak': KeycloakProvider,
        'google': GoogleProvider,
    }
    
    provider_class = providers.get(provider_type.lower())
    
    if not provider_class:
        raise ValueError(f"Unsupported OIDC provider: {provider_type}. Supported providers: {', '.join(providers.keys())}")
    
    return provider_class(config)
