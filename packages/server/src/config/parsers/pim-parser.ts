import { optionalEnv, parseBooleanEnv } from './env-helpers.js';

/**
 * Mutable elevation entitlement type used during parsing
 */
type MutableElevationEntitlement = {
  key?: string;
  provider?: string;
  target?: string;
  permissionBundle?: string;
  maxDurationMinutes?: string;
  requireJustification?: string;
};

/**
 * Parses a comma-separated list of permissions from an environment variable
 * @param value - The environment variable value
 * @param envName - The environment variable name (for error messages)
 * @returns Array of validated permissions
 * @throws Error if no valid permissions are found
 */
export const parsePermissionBundle = (
  value: string | undefined,
  envName: string
): Array<'view' | 'write' | 'delete' | 'manage_properties'> => {
  const normalized = optionalEnv(value);
  if (!normalized) {
    throw new Error(`${envName} must contain at least one permission`);
  }

  const permissions = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(
      (entry): entry is 'view' | 'write' | 'delete' | 'manage_properties' =>
        entry === 'view' || entry === 'write' || entry === 'delete' || entry === 'manage_properties'
    );

  if (permissions.length === 0) {
    throw new Error(
      `${envName} must contain one or more valid permissions: view, write, delete, manage_properties`
    );
  }

  return Array.from(new Set(permissions));
};

/**
 * Parses PIM elevation entitlements from environment variables
 *
 * Expected format:
 * - ELEVATION_0_KEY
 * - ELEVATION_0_PROVIDER (azure or google)
 * - ELEVATION_0_TARGET
 * - ELEVATION_0_PERMISSION_BUNDLE (comma-separated list)
 * - ELEVATION_0_MAX_DURATION_MINUTES (optional)
 * - ELEVATION_0_REQUIRE_JUSTIFICATION (optional)
 *
 * @returns Array of elevation entitlement configurations or undefined if none found
 */
export const parseElevationEntitlementsEnv = (): unknown => {
  const entitlementByIndex = new Map<number, MutableElevationEntitlement>();

  for (const [envName, envValue] of Object.entries(process.env)) {
    const match = envName.match(
      /^ELEVATION_(\d+)_(KEY|PROVIDER|TARGET|PERMISSION_BUNDLE|MAX_DURATION_MINUTES|REQUIRE_JUSTIFICATION)$/
    );
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const field = match[2];
    const entitlement = entitlementByIndex.get(index) ?? {};

    if (field === 'KEY') {
      entitlement.key = envValue;
    } else if (field === 'PROVIDER') {
      entitlement.provider = envValue;
    } else if (field === 'TARGET') {
      entitlement.target = envValue;
    } else if (field === 'PERMISSION_BUNDLE') {
      entitlement.permissionBundle = envValue;
    } else if (field === 'MAX_DURATION_MINUTES') {
      entitlement.maxDurationMinutes = envValue;
    } else if (field === 'REQUIRE_JUSTIFICATION') {
      entitlement.requireJustification = envValue;
    }

    entitlementByIndex.set(index, entitlement);
  }

  if (entitlementByIndex.size === 0) {
    return undefined;
  }

  const sortedIndexes = [...entitlementByIndex.keys()].sort((a, b) => a - b);

  return sortedIndexes.map((index) => {
    const entitlement = entitlementByIndex.get(index)!;
    const key = optionalEnv(entitlement.key);
    const provider = optionalEnv(entitlement.provider);
    const target = optionalEnv(entitlement.target);

    if (!key || !provider || !target) {
      throw new Error(
        `Elevation entitlement ${index} is missing required values. Set ELEVATION_${index}_KEY, ELEVATION_${index}_PROVIDER, and ELEVATION_${index}_TARGET`
      );
    }

    return {
      key,
      provider,
      target,
      permissions: parsePermissionBundle(
        entitlement.permissionBundle,
        `ELEVATION_${index}_PERMISSION_BUNDLE`
      ),
      maxDurationMinutes: Number.parseInt(entitlement.maxDurationMinutes ?? '60', 10),
      requireJustification: parseBooleanEnv(
        entitlement.requireJustification,
        `ELEVATION_${index}_REQUIRE_JUSTIFICATION`,
        false
      ),
    };
  });
};
