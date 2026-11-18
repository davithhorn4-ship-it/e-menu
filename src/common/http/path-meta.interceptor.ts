// src/common/http/path-meta.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';

/**
 * Adds `meta.path` and `meta.timestamp` (ISO 8601, UTC) to every successful
 * object response, keeping any `meta` the handler already returned
 * (e.g. pagination).
 */
@Injectable()
export class PathMetaInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request | undefined>();
    const path = req?.originalUrl ?? req?.url;
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data: unknown) => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const body = data as { meta?: Record<string, unknown> };
          const meta = {
            ...(body.meta ?? {}),
            path,
            timestamp,
          };
          return { ...body, meta };
        }
        return data;
      }),
    );
  }
}
