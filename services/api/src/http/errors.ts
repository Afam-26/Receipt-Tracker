import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (res.headersSent) { _next(err); return; }
  const e = err as { status?: number; statusCode?: number; type?: string; message?: string } | null;
  let status = err instanceof HttpError ? err.status : (e?.status ?? e?.statusCode ?? 500);
  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;
  let code = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
  let message = err instanceof HttpError ? err.message : 'An unexpected error occurred';
  if (!(err instanceof HttpError)) {
    if (e?.type === 'entity.parse.failed' || status === 400) {
      status = 400; code = 'BAD_REQUEST'; message = 'Invalid request body';
    } else if (e?.type === 'entity.too.large' || status === 413) {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large';
    } else {
      status = 500;
      // Do not expose stack traces, SQL diagnostics, or credentials.
      console.error('Unhandled API error', { requestId: res.getHeader('x-request-id'), method: req.method, path: req.path });
    }
  }
  res.status(status).json({ ok: false, error: { code, message } });
};
