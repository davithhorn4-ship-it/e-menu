import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HttpTiming');

const elapsedMs = (start: bigint) =>
  Number(process.hrtime.bigint() - start) / 1e6;

/**
 * Measures each request from the first middleware to the response.
 * - `Server-Timing: app;dur=<ms>` is added right before the headers go out
 *   (time until the response starts, so it includes guards and handlers).
 * - On finish, logs method, matched route, status and total duration at
 *   debug level.
 */
export function serverTimingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = process.hrtime.bigint();

  const writeHead = res.writeHead;
  res.writeHead = function (this: Response, ...args: any[]) {
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${elapsedMs(start).toFixed(1)}`);
    }
    return (writeHead as (...a: any[]) => Response).apply(this, args);
  } as Response['writeHead'];

  res.on('finish', () => {
    // Route pattern (e.g. /users/:id) keeps logs groupable; fall back to the
    // path without the query string for unmatched (catch-all) routes.
    const pattern: string | undefined = req.route?.path;
    const route =
      pattern && !pattern.includes('*')
        ? `${req.baseUrl ?? ''}${pattern}`
        : (req.originalUrl ?? req.url).split('?')[0];
    logger.debug(
      `${req.method} ${route} ${res.statusCode} ${elapsedMs(start).toFixed(1)}ms`,
    );
  });

  next();
}
