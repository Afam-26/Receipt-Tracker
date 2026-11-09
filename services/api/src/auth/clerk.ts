import { createClerkClient, verifyToken } from '@clerk/backend';
import type { AuthProvider } from './types.js';

export type ClerkConfig = { secretKey: string; issuer?: string; authorizedParties?: string[] };
export function createClerkProvider(config: ClerkConfig): AuthProvider {
  const clerk = createClerkClient({ secretKey: config.secretKey });
  return {
    async verify(token) {
      const claims = await verifyToken(token, {
        secretKey: config.secretKey,
        ...(config.issuer ? { issuer: config.issuer } : {}),
        ...(config.authorizedParties?.length ? { authorizedParties: config.authorizedParties } : {}),
      });
      if (!claims.sub || typeof claims.sub !== 'string') throw new Error('Missing subject');
      return claims.sub;
    },
    async getIdentity(subject) {
      const user = await clerk.users.getUser(subject);
      // Identity comes from Clerk's backend API, never the mobile request body.
      if (user.id !== subject) throw new Error('Clerk user mismatch');
      const preferred = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId);
      return { subject, email: preferred?.emailAddress ?? null };
    },
  };
}
