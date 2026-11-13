import { createPool } from 'mysql2/promise';
import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { createDatabaseProbe } from './db/probe.js';
import { createUserStore } from './db/user-store.js';
import { createClerkProvider } from './auth/clerk.js';
import { createGroceryStore } from './grocery/store.js';
import { createGasStore } from './gas/store.js';
import {createAnalyticsStore} from './analytics/store.js';
import { createReceiptStore } from './receipts/store.js';
import { createRailwayBucketStorage, readRailwayBucketSettings } from './receipts/storage.js';
import { createOcrStore } from './ocr/store.js';
import { createReviewStore } from './review/store.js';
import { createGroceryDashboardStore } from './grocery/dashboard.js';

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
const analytics = createAnalyticsStore(config.databaseUrl);
const groceryDashboard = createGroceryDashboardStore(config.databaseUrl);
// Utility uses a dedicated pool, following the existing independent-store pattern.
const utilityPool = createPool({ uri: config.databaseUrl, connectionLimit: 5, waitForConnections: true, timezone: 'Z', decimalNumbers: false });
const bucket=readRailwayBucketSettings();
// Fail closed: upload routes are not registered until Railway storage is fully configured.
const receipts=bucket?{store:createReceiptStore(config.databaseUrl),storage:createRailwayBucketStorage(bucket)}:undefined;
const ocr=bucket?createOcrStore(config.databaseUrl):undefined;
const review=bucket?createReviewStore(config.databaseUrl):undefined;
if (!bucket) console.warn('Railway bucket is not configured; receipt upload routes are disabled');
const app = createApp({ database, auth: { provider, store: userStore }, grocery, gas, analytics, receipts, ocr, review, utilities: {pool: utilityPool} , groceryDashboard });
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
    try { await Promise.all([database.close(), userStore.close(), grocery.close(), gas.close(), analytics.close(), groceryDashboard.close(), utilityPool.end(), ...(receipts?[receipts.store.close()]:[]), ...(ocr?[ocr.close()]:[]), ...(review?[review.close()]:[])]); }
    catch { process.exitCode = 1; }
    if (error) process.exitCode = 1;
  });
  // Prevent a permanently hung connection from blocking process termination.
  server.closeIdleConnections();
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
