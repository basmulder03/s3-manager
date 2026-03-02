import type { Permission } from '@/trpc';
import type { ElevationSource } from '@/auth/types';

export type SupportedElevationProvider = 'azure' | 'google';
export type ElevationRequestStatus = 'pending' | 'granted' | 'denied' | 'error';

export interface ProviderRequestResult {
  providerRequestId: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

export interface StoredRequest {
  id: string;
  userId: string;
  userEmail: string;
  entitlementKey: string;
  provider: SupportedElevationProvider;
  target: string;
  permissions: Permission[];
  durationMinutes: number;
  requestedAt: string;
  justification?: string;
  providerRequestId?: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

export interface ElevationEntitlementView {
  key: string;
  provider: SupportedElevationProvider;
  target: string;
  maxDurationMinutes: number;
  permissions: Permission[];
  requiresJustification: boolean;
}

export interface ElevationRequestView {
  id: string;
  entitlementKey: string;
  provider: SupportedElevationProvider;
  target: string;
  permissions: Permission[];
  durationMinutes: number;
  requestedAt: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

export interface MockElevationState {
  permissions: Permission[];
  elevationSources: ElevationSource[];
}
