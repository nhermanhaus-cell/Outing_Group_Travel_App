import { defineProviderPlugin } from '../../registry.js';
import type { AuthReq, AuthRes, AuthUser } from '../../interfaces.js';

const MOCK_USER: AuthUser = {
  userId: 'mock-user-001',
  email: 'demo@gayi.app',
  displayName: 'Demo Traveller',
  avatarUrl: undefined,
};

let session: AuthUser | null = MOCK_USER;

export const authMock = defineProviderPlugin<AuthReq, AuthRes>({
  id: 'auth:mock',
  slot: 'auth',
  label: 'Mock Auth',
  description: 'Simulates authentication with a fixed mock user for development.',
  isMock: true,
  create() {
    return {
      async call(req): Promise<AuthRes> {
        if (req.action === 'signIn' || req.action === 'signInWithProvider') {
          session = MOCK_USER;
          return { action: req.action, user: session, token: 'mock-jwt-token' };
        }
        if (req.action === 'signOut') {
          session = null;
          return { action: 'signOut', success: true };
        }
        // getSession
        return { action: 'getSession', user: session };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
