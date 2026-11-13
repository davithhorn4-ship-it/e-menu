// src/common/http/path-meta.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Adds `meta.path` and `meta.timestamp` (ISO 8601, UTC) to every successful
 * object response, keeping any `meta` the handler already returned
 * (e.g. pagination).
 */
@Injectable()
export class PathMetaInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const path = req?.originalUrl ?? req?.url;
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const meta = {
            ...(data.meta ?? {}),
            path,
            timestamp,
          };
          return { ...data, meta };
        }
        return data;
      }),
    );
  }
}
