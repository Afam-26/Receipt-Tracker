import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { createDatabaseProbe } from './db/probe.js';
import { createUserStore } from './db/user-store.js';
import { createClerkProvider } from './auth/clerk.js';
import { createGroceryStore } from './grocery/store.js';
import { createGasStore } from './gas/store.js';

const config = readConfig();
const database = createDatabaseProbe(config.databaseUrl);
if (!config.databaseUrl) throw new Error('DATABASE_URL is required for authentication');
if (!config.clerkSecretKey) throw new Error('CLERK_SECRET_KEY is required for authentication');
const userStore = createUserStore(config.databaseUrl);
const provider = createClerkProvider({
  secretKey: config.clerkSecretKey,
  issuer: config.clerkIssuer,
  authorizedParties: config.clerkAuthorizedParties,
});
const grocery = createGroceryStore(config.databaseUrl);
const gas = createGasStore(config.databaseUrl);
const app = createApp({ database, auth: { provider, store: userStore }, grocery, gas });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Receipt Tracker API listening on port ${config.port}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down API (${signal})`);
  // Stop accepting connections. Existing requests can finish.
  server.close(async (error) => {
    try { await Promise.all([database.close(), userStore.close(), grocery.close(), gas.close()]); }
    catch { process.exitCode = 1; }
    if (error) process.exitCode = 1;
  });
  // Prevent a permanently hung connection from blocking process termination.
  server.closeIdleConnections();
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
