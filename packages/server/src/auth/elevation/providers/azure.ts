import { config } from '@/config';
import type { AuthUser } from '@/auth/types';
import type { ProviderRequestResult } from '../types';
import { ElevationError } from '../error';
import { ensureProviderToken, parseStatus } from '../utils';

const ensureAzureEligibility = async (params: {
  token: string;
  principalId: string;
  groupId: string;
}): Promise<void> => {
  const filter = `principalId eq '${params.principalId}' and groupId eq '${params.groupId}'`;
  const url = new URL(config.pim.azure.eligibilityScheduleApi);
  url.searchParams.set('$filter', filter);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to verify Azure PIM eligibility (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    value?: Array<Record<string, unknown>>;
  };

  if (!payload.value || payload.value.length === 0) {
    throw new ElevationError(403, 'User is not eligible for this Azure PIM entitlement');
  }
};

export const requestAzureElevation = async (params: {
  token: string;
  user: AuthUser;
  groupId: string;
  justification?: string;
  durationMinutes: number;
}): Promise<ProviderRequestResult> => {
  ensureProviderToken(params.token);
  await ensureAzureEligibility({
    token: params.token,
    principalId: params.user.id,
    groupId: params.groupId,
  });

  const scheduleInfo = {
    startDateTime: new Date().toISOString(),
    expiration: {
      type: 'afterDuration',
      duration: `PT${params.durationMinutes}M`,
    },
  };

  const response = await fetch(config.pim.azure.assignmentScheduleRequestApi, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'selfActivate',
      principalId: params.user.id,
      groupId: params.groupId,
      accessId: 'member',
      justification: params.justification,
      scheduleInfo,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Azure PIM elevation request failed (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    scheduleInfo?: {
      expiration?: {
        endDateTime?: string;
      };
    };
  };

  return {
    providerRequestId: payload.id ?? crypto.randomUUID(),
    status: parseStatus(payload.status),
    expiresAt: payload.scheduleInfo?.expiration?.endDateTime,
    message: payload.status ? `Azure request status: ${payload.status}` : undefined,
  };
};

export const fetchAzureStatus = async (params: {
  token: string;
  providerRequestId: string;
}): Promise<ProviderRequestResult> => {
  const response = await fetch(
    `${config.pim.azure.assignmentScheduleRequestApi}/${encodeURIComponent(params.providerRequestId)}`,
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to fetch Azure PIM request status (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    scheduleInfo?: {
      expiration?: {
        endDateTime?: string;
      };
    };
  };

  return {
    providerRequestId: payload.id ?? params.providerRequestId,
    status: parseStatus(payload.status),
    expiresAt: payload.scheduleInfo?.expiration?.endDateTime,
    message: payload.status ? `Azure request status: ${payload.status}` : undefined,
  };
};
