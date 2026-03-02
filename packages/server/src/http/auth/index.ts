/**
 * HTTP Authentication Module
 *
 * This module provides HTTP route handlers for authentication and authorization.
 * It is organized into focused sub-modules:
 *
 * - utils: Path construction and validation utilities
 * - cookies: Cookie configuration and management
 * - rate-limit: Rate limiting for elevation endpoints
 * - session-handlers: Session management route handlers
 * - elevation-handlers: Privilege elevation route handlers
 */

// Re-export utilities
export {
  apiPath,
  trimTrailingSlash,
  resolveClientIp,
  resolveReturnTo,
  getCallbackPath,
} from './utils';

// Re-export cookie management
export { cookieBaseOptions, clearAuthCookies } from './cookies';

// Re-export rate limiting
export { pruneElevationRateLimit, enforceElevationRateLimit } from './rate-limit';

// Re-export session handlers
export {
  handleLogin,
  handleCallback,
  handleLogoutGet,
  handleLogoutPost,
  handleGetUser,
  handleRefresh,
} from './session-handlers';

// Re-export elevation handlers
export {
  handleLegacyElevate,
  handleGetElevationEntitlements,
  handleElevationRequest,
  handleGetElevationStatus,
  handleDeactivateElevation,
} from './elevation-handlers';
