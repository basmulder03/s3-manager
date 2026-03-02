import type { Config } from '../schemas/index.js';

/**
 * Runtime validations that apply across different environments
 */

/**
 * Validates non-test environment requirements
 * @param config - The configuration to validate
 * @throws Error if validation fails
 */
export const validateNonTestEnvironment = (config: Config): void => {
  if (config.nodeEnv !== 'test') {
    if (config.localDevMode) {
      throw new Error('LOCAL_DEV_MODE is only allowed when NODE_ENV=test');
    }
    if (!config.auth.required) {
      throw new Error('AUTH_REQUIRED must be true when NODE_ENV is not test');
    }
  }
};
