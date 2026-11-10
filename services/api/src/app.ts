import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import type { DatabaseProbe } from './db/probe.js';
import { errorHandler, notFound } from './http/errors.js';
import { registerAuthRoutes } from './auth/routes.js';
import type { AuthServices } from './auth/types.js';
import type { GroceryStore } from './grocery/store.js';
import { registerGroceryRoutes } from './grocery/routes.js';
import type { GasStore } from './gas/store.js';
import { registerGasRoutes } from './gas/routes.js';
import {registerAnalyticsRoutes} from './analytics/routes.js';
import type {AnalyticsStore} from './analytics/store.js';

export function createApp({ database, registerRoutes, auth, grocery, gas, analytics }: {
  database: DatabaseProbe;
  registerRoutes?: (app: Express) => void;
  auth?: AuthServices;
  grocery?: GroceryStore;
  gas?: GasStore;
  analytics?: AnalyticsStore;
}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('x-request-id', randomUUID()); next(); });
  app.use(express.json({ limit: '64kb' }));

  const health: express.RequestHandler = (_req, res) => {
    res.status(200).json({ ok: true, service: 'receipt-tracker-api' });
  };
  const ready: express.RequestHandler = async (_req, res) => {
    try {
      await database.ping();
      res.status(200).json({ ok: true, database: 'connected' });
    } catch {
      res.status(503).json({ ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database not ready' } });
    }
  };
  app.get('/api/health', health);
  app.get('/api/ready', ready);
  // Preserve Phase 2A endpoints for any existing local health probes.
  app.get('/health', health);
  app.get('/ready', ready);

  if (auth) registerAuthRoutes(app, auth);
  if (auth && grocery) registerGroceryRoutes(app, auth, grocery);
  if (auth && gas) registerGasRoutes(app, auth, gas);
  if (auth && analytics && gas) registerAnalyticsRoutes(app, auth, analytics, gas);
  registerRoutes?.(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
