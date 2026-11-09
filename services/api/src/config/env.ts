import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve relative to this file, never the workspace's current working directory.
// Existing process environment (for example Railway service variables) takes precedence.
dotenv.config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export type ApiConfig = Readonly<{
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string | undefined;
  clerkSecretKey: string | undefined;
  clerkIssuer: string | undefined;
  clerkAuthorizedParties: string[] | undefined;
}>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const rawPort = env.PORT ?? '5001';
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  const value = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(value)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const parties = env.CLERK_AUTHORIZED_PARTIES?.split(',').map(p => p.trim()).filter(Boolean);
  return {
    port, nodeEnv: value as ApiConfig['nodeEnv'], databaseUrl: env.DATABASE_URL || undefined,
    clerkSecretKey: env.CLERK_SECRET_KEY || undefined,
    clerkIssuer: env.CLERK_ISSUER || undefined,
    clerkAuthorizedParties: parties?.length ? parties : undefined,
  };
}
