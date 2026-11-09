import type { Express, Request, RequestHandler } from 'express';
import { HttpError } from '../http/errors.js';
import type { AuthServices, LocalUser } from './types.js';

export type AuthRequest = Request & { authenticatedUser?: LocalUser };

export function createRequireUser(services: AuthServices): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header('authorization');
    if (!header) return next(new HttpError(401, 'AUTH_REQUIRED', 'Authentication required'));
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match || match[1].length > 8192) return next(new HttpError(401, 'INVALID_TOKEN', 'Invalid authentication token'));
    let subject: string;
    try {
      subject = await services.provider.verify(match[1]);
      if (!subject) throw new Error('No subject');
    } catch {
      return next(new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token'));
    }
    try {
      const identity = await services.provider.getIdentity(subject);
      if (identity.subject !== subject) throw new Error('Identity mismatch');
      (req as AuthRequest).authenticatedUser = await services.store.sync(identity);
      next();
    } catch {
      next(new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'Account synchronization temporarily unavailable'));
    }
  };
}

export function registerAuthRoutes(app: Express, services: AuthServices): void {
  const requireUser = createRequireUser(services);
  app.get('/api/me', requireUser, (req, res) => {
    const user = (req as AuthRequest).authenticatedUser!;
    res.json({ ok: true, user: { id: user.id, email: user.email } });
  });
  app.get('/api/me/settings', requireUser, async (req, res) => {
    const user = (req as AuthRequest).authenticatedUser!;
    const settings = await services.store.getSettings(user.id);
    if (!settings) throw new HttpError(404, 'SETTINGS_NOT_FOUND', 'Settings not found');
    res.json({ ok: true, settings });
  });
}
