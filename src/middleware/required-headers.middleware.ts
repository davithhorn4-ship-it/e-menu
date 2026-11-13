import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SKIP = (req: Request) =>
  req.method === 'OPTIONS' ||
  req.url === '/health' ||
  req.url.startsWith('/_next') ||
  req.url.startsWith('/static') ||
  req.url.startsWith('/favicon.ico');

@Injectable()
export class RequiredHeadersMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    if (SKIP(req)) return next();

    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = crypto.randomUUID();
    }

    return next();
  }
}
