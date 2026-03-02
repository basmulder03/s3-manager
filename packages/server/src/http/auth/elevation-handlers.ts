import type { Context } from 'hono';
import { getLogger } from '@/telemetry';
import { resolveAuthUser } from '@/auth/context';
import {
  deactivateElevation,
  getElevationRequestStatus,
  isElevationError,
  listElevationEntitlements,
  submitElevationRequest,
} from '@/auth/elevation';
import { enforceSameOriginForMutation } from '@/http/csrf';
import { enforceElevationRateLimit } from './rate-limit';

const authLogger = () => getLogger('Auth');

/**
 * Handler for POST /api/auth/pim/elevate
 * Legacy elevation endpoint that submits a privilege elevation request
 */
export const handleLegacyElevate = async (c: Context) => {
  const csrfFailure = enforceSameOriginForMutation(c);
  if (csrfFailure) {
    return csrfFailure;
  }

  const user = await resolveAuthUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const rateLimited = enforceElevationRateLimit(c, user.id, '/api/auth/pim/elevate');
  if (rateLimited) {
    return rateLimited;
  }

  let entitlementKey = '';
  let justification = '';
  let durationMinutes: number | undefined;
  try {
    const body = await c.req.json<{
      role?: string;
      justification?: string;
      durationMinutes?: number;
    }>();
    entitlementKey = body.role?.trim() ?? '';
    justification = body.justification?.trim() ?? '';
    durationMinutes = body.durationMinutes;
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!entitlementKey) {
    return c.json({ error: 'Role is required' }, 400);
  }

  try {
    const request = await submitElevationRequest({
      user,
      entitlementKey,
      justification,
      durationMinutes,
    });

    return c.json({
      message: 'Elevation request submitted',
      request,
    });
  } catch (error) {
    if (isElevationError(error)) {
      return c.json({ error: error.message }, error.status as never);
    }

    authLogger().error({ err: error }, 'Failed to submit legacy elevation request');
    return c.json({ error: 'Failed to submit elevation request' }, 500);
  }
};

/**
 * Handler for GET /api/auth/elevation/entitlements
 * Lists available elevation entitlements for the current user
 */
export const handleGetElevationEntitlements = async (c: Context) => {
  const user = await resolveAuthUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    const entitlements = listElevationEntitlements();
    return c.json({
      entitlements,
    });
  } catch (error) {
    if (isElevationError(error)) {
      return c.json({ error: error.message }, error.status as never);
    }

    authLogger().error({ err: error }, 'Failed to list elevation entitlements');
    return c.json({ error: 'Failed to load elevation entitlements' }, 500);
  }
};

/**
 * Handler for POST /api/auth/elevation/request
 * Submits a new privilege elevation request
 */
export const handleElevationRequest = async (c: Context) => {
  const csrfFailure = enforceSameOriginForMutation(c);
  if (csrfFailure) {
    return csrfFailure;
  }

  const user = await resolveAuthUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const rateLimited = enforceElevationRateLimit(c, user.id, '/api/auth/elevation/request');
  if (rateLimited) {
    return rateLimited;
  }

  let entitlementKey = '';
  let justification = '';
  let durationMinutes: number | undefined;
  try {
    const body = await c.req.json<{
      entitlementKey?: string;
      justification?: string;
      durationMinutes?: number;
    }>();
    entitlementKey = body.entitlementKey?.trim() ?? '';
    justification = body.justification?.trim() ?? '';
    durationMinutes = body.durationMinutes;
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!entitlementKey) {
    return c.json({ error: 'entitlementKey is required' }, 400);
  }

  try {
    const request = await submitElevationRequest({
      user,
      entitlementKey,
      justification,
      durationMinutes,
    });

    return c.json({
      request,
    });
  } catch (error) {
    if (isElevationError(error)) {
      return c.json({ error: error.message }, error.status as never);
    }

    authLogger().error({ err: error }, 'Failed to submit elevation request');
    return c.json({ error: 'Failed to submit elevation request' }, 500);
  }
};

/**
 * Handler for GET /api/auth/elevation/status/:requestId
 * Gets the status of a specific elevation request
 */
export const handleGetElevationStatus = async (c: Context) => {
  const user = await resolveAuthUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const requestId = c.req.param('requestId')?.trim() ?? '';
  if (!requestId) {
    return c.json({ error: 'requestId is required' }, 400);
  }

  try {
    const request = await getElevationRequestStatus({
      user,
      requestId,
    });

    return c.json({ request });
  } catch (error) {
    if (isElevationError(error)) {
      return c.json({ error: error.message }, error.status as never);
    }

    authLogger().error({ err: error }, 'Failed to fetch elevation request status');
    return c.json({ error: 'Failed to fetch elevation request status' }, 500);
  }
};

/**
 * Handler for POST /api/auth/elevation/deactivate
 * Deactivates an active elevation
 */
export const handleDeactivateElevation = async (c: Context) => {
  const csrfFailure = enforceSameOriginForMutation(c);
  if (csrfFailure) {
    return csrfFailure;
  }

  const user = await resolveAuthUser(c.req.raw);
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const rateLimited = enforceElevationRateLimit(c, user.id, '/api/auth/elevation/deactivate');
  if (rateLimited) {
    return rateLimited;
  }

  let entitlementKey = '';
  try {
    const body = await c.req.json<{ entitlementKey?: string }>();
    entitlementKey = body.entitlementKey?.trim() ?? '';
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!entitlementKey) {
    return c.json({ error: 'entitlementKey is required' }, 400);
  }

  try {
    const result = await deactivateElevation({
      user,
      entitlementKey,
    });
    return c.json(result);
  } catch (error) {
    if (isElevationError(error)) {
      return c.json({ error: error.message }, error.status as never);
    }

    authLogger().error({ err: error }, 'Failed to deactivate elevation');
    return c.json({ error: 'Failed to deactivate elevation' }, 500);
  }
};
