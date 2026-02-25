import { createHash, randomBytes } from 'node:crypto';

interface AuthStateRecord {
  returnTo: string;
  codeVerifier: string;
  nonce: string;
  createdAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, AuthStateRecord>();

const base64Url = (input: Buffer): string => {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const randomToken = (size = 32): string => base64Url(randomBytes(size));

const codeChallengeFromVerifier = (verifier: string): string => {
  const hash = createHash('sha256').update(verifier).digest();
  return base64Url(hash);
};

const purgeExpiredStates = (): void => {
  const now = Date.now();
  for (const [key, value] of stateStore.entries()) {
    if (now - value.createdAt > STATE_TTL_MS) {
      stateStore.delete(key);
    }
  }
};

export const createAuthState = (returnTo: string): {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
} => {
  purgeExpiredStates();

  const state = randomToken(24);
  const nonce = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = codeChallengeFromVerifier(codeVerifier);

  stateStore.set(state, {
    returnTo,
    codeVerifier,
    nonce,
    createdAt: Date.now(),
  });

  return {
    state,
    nonce,
    codeVerifier,
    codeChallenge,
  };
};

export const consumeAuthState = (
  state: string
): {
  returnTo: string;
  codeVerifier: string;
  nonce: string;
} | null => {
  purgeExpiredStates();

  const record = stateStore.get(state) ?? null;
  if (!record) {
    return null;
  }

  stateStore.delete(state);
  return {
    returnTo: record.returnTo,
    codeVerifier: record.codeVerifier,
    nonce: record.nonce,
  };
};
