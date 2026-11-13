// src/common/filters/http-error.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { subnet24 } from 'src/common/risk/risk.utils';

type CustomBody = {
  code?: string;
  message?: string | string[];
  details?: any;
  error?: string;
  statusCode?: number;
};

type RiskMeta = {
  ip?: string;
  deviceIdHash?: string;
  emailHash?: string;
  uaHash?: string;
  domain?: string;
  reason?: string;
};

type RiskReq = Request & {
  __risk?: RiskMeta;
};

@Catch() // catch everything
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const isHttpException = exception instanceof HttpException;
    const rawStatus = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (
      process.env.NODE_ENV !== 'production' &&
      (!isHttpException || rawStatus >= 500)
    ) {
      console.error('HTTP_FILTER_RAW_EXCEPTION', exception);
    }

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<RiskReq>();
    const res = ctx.getResponse<Response>();

    const isProd = process.env.NODE_ENV === 'production';
    const nowIso = new Date().toISOString();

    const requestId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      undefined;

    const isBodyTooLargeError =
      typeof (exception as any)?.type === 'string' &&
      (exception as any).type === 'entity.too.large';
    const isDatabaseUnavailableError = (exception as any)?.code === 'P1001';

    const normalizedException = isBodyTooLargeError
      ? new PayloadTooLargeException({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body is too large',
        })
      : isDatabaseUnavailableError
        ? new ServiceUnavailableException({
            code: 'DATABASE_UNAVAILABLE',
            message: 'Database is temporarily unavailable',
          })
        : exception;

    const isHttp = normalizedException instanceof HttpException;

    const status = isHttp
      ? normalizedException.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const resp = isHttp
      ? (normalizedException.getResponse() as string | CustomBody)
      : null;

    const isObj = typeof resp === 'object' && resp !== null;
    const body: CustomBody = isObj ? resp : resp ? { message: resp } : {};

    const rawMsg = body.message;

    // ── 429 telemetry ────────────────────────────────────────────────────────
    if (status === 429) {
      const r = req.__risk || {};
      this.logger.warn(
        JSON.stringify({
          evt: 'rate_limit',
          path: req.originalUrl || req.url,
          ip: r.ip || null,
          ip_subnet24: r.ip ? subnet24(r.ip) : null,
          deviceIdHash: r.deviceIdHash || null,
          emailHash: r.emailHash || null,
          uaHash: r.uaHash || null,
          domain: r.domain || null,
          reason: r.reason || 'throttle',
          requestId: requestId || null,
          ts: nowIso,
        }),
      );
    } else {
      // ── diagnostics (avoid logging whole body) ─────────────────────────────
      const logPayload = {
        pid: process.pid,
        method: req.method,
        url: req.originalUrl || req.url,
        status,
        bodyKeys: Object.keys(req.body || {}),
        exceptionName: isHttp
          ? normalizedException.name
          : typeof normalizedException,
        exceptionResponse: isHttp
          ? {
              error: body.error,
              message: rawMsg,
              statusCode: body.statusCode ?? status,
              code: body.code,
            }
          : { message: String(normalizedException) },
        headers: {
          'content-type': req.headers['content-type'],
          origin: req.headers['origin'],
          'x-device-id': req.headers['x-device-id'],
        },
        requestId,
        ...(status >= 500 && !isProd
          ? {
              stack:
                normalizedException instanceof Error
                  ? normalizedException.stack
                  : undefined,
            }
          : {}),
      };

      if (status >= 500) {
        this.logger.error(logPayload, 'HTTP request failed');
      } else if (status >= 400) {
        this.logger.warn(logPayload, 'HTTP request rejected');
      } else {
        this.logger.log(logPayload, 'HTTP request failed');
      }
    }

    // ── Code normalization ───────────────────────────────────────────────────
    const defaultCode =
      status === 400
        ? 'BAD_REQUEST'
        : status === 401
          ? 'AUTH_UNAUTHORIZED'
          : status === 403
            ? 'FORBIDDEN'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : status === 404
                ? 'NOT_FOUND'
                : status === 409
                  ? 'CONFLICT'
                  : status === 422
                    ? 'UNPROCESSABLE_ENTITY'
                    : status === 429
                      ? 'RATE_LIMITED'
                      : status >= 500
                        ? 'INTERNAL_ERROR'
                        : 'HTTP_ERROR';

    const code = body.code ?? defaultCode;

    // ── Message + details ────────────────────────────────────────────────────
    let message: string;
    let details: any | undefined;

    if (status === 429) {
      message = 'Too many requests. Try again later.';
    } else if (isProd) {
      if (status === 401) {
        message =
          typeof rawMsg === 'string' && rawMsg.trim().length > 0
            ? rawMsg
            : 'Unauthorized';
      } else if (status === 404) {
        message = 'Resource not found';
      } else if (status === 403) {
        message = 'Forbidden';
      } else if (status === 400 || status === 422) {
        message =
          typeof rawMsg === 'string' && rawMsg.trim().length > 0
            ? rawMsg
            : 'Invalid request';
      } else if (status === 503 && code === 'DATABASE_UNAVAILABLE') {
        message = 'Database is temporarily unavailable';
      } else if (status >= 500) {
        message = 'Unexpected error';
      } else {
        message =
          typeof rawMsg === 'string' && rawMsg.trim().length > 0
            ? rawMsg
            : 'Request failed';
      }
      details = undefined; // don’t expose details in prod
    } else {
      // dev/staging
      message = Array.isArray(rawMsg)
        ? rawMsg.join('; ')
        : (rawMsg as string) ||
          (isHttp ? normalizedException.message : 'Error');

      details =
        body.details ??
        (Array.isArray(rawMsg)
          ? rawMsg
          : normalizedException instanceof Error
            ? normalizedException.stack
            : undefined);
    }

    // ── error field (more consistent) ────────────────────────────────────────
    const errorName =
      status === 429
        ? 'TooManyRequests'
        : isProd && status >= 500
          ? 'InternalError'
          : body.error || (isHttp ? normalizedException.name : 'Error');

    // Recommended: structured response
    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        type: errorName,
        ...(details && !isProd ? { details } : {}),
      },
      meta: {
        statusCode: status,
        // Same ISO format as successful responses.
        timestamp: nowIso,
        path: req.originalUrl || req.url,
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
