import type { Hono } from 'hono';
import { apiPath, getCallbackPath } from './auth/utils';
import {
  handleLogin,
  handleCallback,
  handleLogoutGet,
  handleLogoutPost,
  handleGetUser,
  handleRefresh,
} from './auth/session-handlers';
import {
  handleLegacyElevate,
  handleGetElevationEntitlements,
  handleElevationRequest,
  handleGetElevationStatus,
  handleDeactivateElevation,
} from './auth/elevation-handlers';

/**
 * Registers all authentication and authorization HTTP routes
 *
 * Session management routes:
 * - GET /api/auth/login - Initiates OIDC login
 * - GET /api/auth/callback - OIDC callback handler
 * - GET /api/auth/logout - Logout (returns 405)
 * - POST /api/auth/logout - Logout
 * - GET /api/auth/user - Get current user
 * - POST /api/auth/refresh - Refresh tokens
 *
 * Elevation/PIM routes:
 * - POST /api/auth/pim/elevate - Legacy elevation endpoint
 * - GET /api/auth/elevation/entitlements - List elevation options
 * - POST /api/auth/elevation/request - Submit elevation request
 * - GET /api/auth/elevation/status/:requestId - Check request status
 * - POST /api/auth/elevation/deactivate - Deactivate elevation
 */
export const registerAuthHttpRoutes = (app: Hono): void => {
  // Session management routes
  app.get(apiPath('/auth/login'), handleLogin);
  app.get(getCallbackPath(), handleCallback);
  app.get(apiPath('/auth/logout'), handleLogoutGet);
  app.post(apiPath('/auth/logout'), handleLogoutPost);
  app.get(apiPath('/auth/user'), handleGetUser);
  app.post(apiPath('/auth/refresh'), handleRefresh);

  // Elevation/PIM routes
  app.post(apiPath('/auth/pim/elevate'), handleLegacyElevate);
  app.get(apiPath('/auth/elevation/entitlements'), handleGetElevationEntitlements);
  app.post(apiPath('/auth/elevation/request'), handleElevationRequest);
  app.get(apiPath('/auth/elevation/status/:requestId'), handleGetElevationStatus);
  app.post(apiPath('/auth/elevation/deactivate'), handleDeactivateElevation);
};
