import type { AuthUser } from '@/auth/types';
import type { ProviderRequestResult, SupportedElevationProvider } from '../types';
import { requestAzureElevation, fetchAzureStatus } from './azure';
import { requestGoogleElevation, fetchGoogleStatus } from './google';

export const requestElevation = async (params: {
  provider: SupportedElevationProvider;
  token: string;
  user: AuthUser;
  target: string;
  justification?: string;
  durationMinutes: number;
}): Promise<ProviderRequestResult> => {
  if (params.provider === 'azure') {
    return requestAzureElevation({
      token: params.token,
      user: params.user,
      groupId: params.target,
      durationMinutes: params.durationMinutes,
      justification: params.justification,
    });
  } else {
    return requestGoogleElevation({
      token: params.token,
      user: params.user,
      groupResourceName: params.target,
      durationMinutes: params.durationMinutes,
    });
  }
};

export const fetchStatus = async (params: {
  provider: SupportedElevationProvider;
  token: string;
  providerRequestId: string;
}): Promise<ProviderRequestResult> => {
  if (params.provider === 'azure') {
    return fetchAzureStatus({
      token: params.token,
      providerRequestId: params.providerRequestId,
    });
  } else {
    return fetchGoogleStatus({
      token: params.token,
      providerRequestId: params.providerRequestId,
    });
  }
};
