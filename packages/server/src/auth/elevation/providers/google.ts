import { config } from '@/config';
import type { AuthUser } from '@/auth/types';
import type { ProviderRequestResult } from '../types';
import { ElevationError } from '../error';
import { ensureProviderToken } from '../utils';

export const requestGoogleElevation = async (params: {
  token: string;
  user: AuthUser;
  groupResourceName: string;
  durationMinutes: number;
}): Promise<ProviderRequestResult> => {
  ensureProviderToken(params.token);

  const expiration = new Date(Date.now() + params.durationMinutes * 60_000).toISOString();
  const target = params.groupResourceName;
  const endpoint = `${config.pim.google.membershipsApiBase}/${target}/memberships`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      preferredMemberKey: {
        id: params.user.email,
      },
      roles: [
        {
          name: 'MEMBER',
          expiryDetail: {
            expireTime: expiration,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Google Cloud Identity elevation request failed (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    name?: string;
    done?: boolean;
    error?: {
      message?: string;
    };
  };

  if (payload.error?.message) {
    return {
      providerRequestId: payload.name ?? crypto.randomUUID(),
      status: 'error',
      message: payload.error.message,
      expiresAt: expiration,
    };
  }

  return {
    providerRequestId: payload.name ?? crypto.randomUUID(),
    status: payload.done ? 'granted' : 'pending',
    expiresAt: expiration,
  };
};

export const fetchGoogleStatus = async (params: {
  token: string;
  providerRequestId: string;
}): Promise<ProviderRequestResult> => {
  const endpoint = `${config.pim.google.operationsApiBase}/${params.providerRequestId}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to fetch Google elevation status (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    name?: string;
    done?: boolean;
    error?: {
      message?: string;
    };
  };

  if (payload.error?.message) {
    return {
      providerRequestId: payload.name ?? params.providerRequestId,
      status: 'error',
      message: payload.error.message,
    };
  }

  return {
    providerRequestId: payload.name ?? params.providerRequestId,
    status: payload.done ? 'granted' : 'pending',
  };
};
