/**
 * Environment variable parsing helper functions
 */

/**
 * Normalizes an optional environment variable value by trimming whitespace
 * Returns undefined if the value is undefined or empty after trimming
 */
export const optionalEnv = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Validates that a URL uses HTTPS protocol
 */
export const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Parses a boolean environment variable with proper validation
 * @param value - The environment variable value
 * @param envName - The environment variable name (for error messages)
 * @param defaultValue - The default value if not set
 * @returns The parsed boolean value
 * @throws Error if the value is not 'true' or 'false'
 */
export const parseBooleanEnv = (
  value: string | undefined,
  envName: string,
  defaultValue: boolean
): boolean => {
  const normalized = optionalEnv(value);
  if (normalized === undefined) {
    return defaultValue;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }

  throw new Error(`${envName} must be either 'true' or 'false'`);
};
