// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';
import {
  HttpException,
  Logger,
  UnsupportedMediaTypeException,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { HttpErrorFilter } from './common/http/http-error.filter';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  isLoopbackOrigin,
  isPrivateNetworkOrigin,
  parseOriginList,
} from './common/security/origin';
import { RequiredHeadersMiddleware } from './middleware/required-headers.middleware';
import { serverTimingMiddleware } from './middleware/server-timing.middleware';
import { AuthService } from './modules/auth/auth.service';
import { setAuthUserLookup } from './common/strategy/auth-user-lookup';
import { setupApiDocs } from './common/http/swagger';
import { parseTrustProxy } from './common/security/trust-proxy';
import {
  uploadRoot,
  UPLOADS_URL_PREFIX,
} from './common/storage/local-file-storage';
import {
  makeAccessTokenCheck,
  selectAccessToken,
} from './common/strategy/access-token';
import type { AuthRequest } from './common/types/auth-request.type';
import type { NextFunction, Request, Response } from 'express';

/** Routes that may receive multipart/form-data (file uploads). */
const MULTIPART_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'PUT', path: /^\/users\/[0-9a-f-]{36}\/photo\/?$/i },
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const config = app.get(ConfigService);
  // Only trust X-Forwarded-For from proxies that really exist (TRUST_PROXY);
  // otherwise clients could pick their own IP and skip the rate limits.
  app.set('trust proxy', parseTrustProxy(config.get<string>('TRUST_PROXY')));
  app.useLogger(app.get(PinoLogger));
  // First middleware so the timing covers CORS, auth, guards and handlers.
  app.use(serverTimingMiddleware);

  const logger = new Logger('Bootstrap');

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${String(reason)}`);
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error?.stack ?? error}`);
  });

  const isProd = config.get('NODE_ENV') === 'production';

  // ---- build origins at RUNTIME ----
  const allowedOrigins = buildAllowedOrigins(
    parseOriginList(config.get<string>('APP_URLS')),
  );
  logger.log(`[CORS] allowed origins: ${allowedOrigins.join(', ')}`);

  // ---- CORS ----
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }

      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }

      if (
        !isProd &&
        (origin === 'null' ||
          isLoopbackOrigin(origin) ||
          isPrivateNetworkOrigin(origin))
      ) {
        return callback(null, true);
      }

      logger.warn(`[CORS] rejected origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'content-type',
      'authorization',
      'x-idempotency-key',
      'idempotency-key',
      'x-request-id',
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ---- Uploaded files (profile photos) ----
  // Public, read-only images under /uploads/. File names are random UUIDs.
  // CORP cross-origin so the dashboard on another origin can show them.
  app.useStaticAssets(uploadRoot(config.get<string>('UPLOAD_DIR')), {
    prefix: UPLOADS_URL_PREFIX,
    index: false,
    dotfiles: 'deny',
    redirect: false,
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });

  if (!isProd) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.on('finish', () => {
        logger.debug(
          `REQ ${req.method} ${req.originalUrl} -> ${res.statusCode}`,
        );
      });
      next();
    });
  }

  app.useGlobalFilters(new HttpErrorFilter());

  // ---- Content-Type guard (skip OPTIONS) ----
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const m = req.method;

    if (m === 'OPTIONS') return next();

    const contentType = req.headers['content-type'];
    const hasBody =
      Number(req.headers['content-length'] || 0) > 0 ||
      req.headers['transfer-encoding'] !== undefined;

    if (
      hasBody &&
      (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE')
    ) {
      // File uploads (multipart/form-data) are accepted only on the routes
      // listed in MULTIPART_ROUTES; every other body must be JSON.
      const isAllowedUpload =
        MULTIPART_ROUTES.some((r) => r.method === m && r.path.test(req.path)) &&
        !!req.is('multipart/form-data');
      if (
        !isAllowedUpload &&
        (!contentType || !req.is || !req.is('application/json'))
      ) {
        return next(
          new UnsupportedMediaTypeException({
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Unsupported Media Type',
          }),
        );
      }
    }
    next();
  });

  // ---- Body parsers ----
  const jsonBodyLimit = config.get<string>('BODY_JSON_LIMIT', '64kb');
  const urlencodedBodyLimit = config.get<string>(
    'BODY_URLENCODED_LIMIT',
    '16kb',
  );

  app.use(
    bodyParser.json({
      limit: jsonBodyLimit,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    bodyParser.urlencoded({
      extended: false,
      limit: urlencodedBodyLimit,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // ---- Global validation ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
      disableErrorMessages: isProd,
    }),
  );

  // ---- Security middleware ----
  app.use(hpp());
  app.use(compression({ threshold: '1kb' }));
  app.use(cookieParser());

  // ---- Attach req.user if a valid token is sent ----
  // Sets req.user early (request logs show who called) and stores the user
  // lookup so JwtStrategy does not load the same user again. It never
  // rejects a request: the guards decide that.
  const authService = app.get(AuthService);
  const isValidAccessToken = makeAccessTokenCheck(
    config.getOrThrow<string>('JWT_ACCESS_SECRET'),
  );
  const attachUser = async (req: AuthRequest) => {
    // Same choice as JwtStrategy (Bearer, or the cookie when the Bearer
    // token is invalid), so the guard can reuse this lookup.
    const token = selectAccessToken(req, isValidAccessToken);
    if (!token) return;

    try {
      const user = await authService.getUserFromAccessToken(
        token,
        (sub, loaded) => setAuthUserLookup(req, { token, sub, user: loaded }),
      );
      req.user = { userId: user.id, email: user.email, role: user.role };
    } catch (err) {
      // 4xx = bad or expired token, answered later by the guard. Only
      // unexpected failures (e.g. database down) are worth a log line.
      if (!(err instanceof HttpException) || err.getStatus() >= 500) {
        logger.warn(`Auth attach middleware failed: ${String(err)}`);
      }
    }
  };
  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') return next();
    void attachUser(req).finally(() => next());
  });

  // ✅ Required headers should NOT block OPTIONS (we already returned for OPTIONS above)
  app.use(new RequiredHeadersMiddleware().use);

  app.disable('x-powered-by');
  app.set('etag', 'strong');

  app.enableShutdownHooks();
  setupApiDocs(app, config, logger);

  // Keep idle connections open longer than Node's 5s default. The server
  // advertises this in `Keep-Alive: timeout=…`, so the Next proxy (fetch)
  // reuses its connection between clicks instead of reconnecting (new TCP +
  // TLS) every few seconds. headersTimeout must stay above keepAliveTimeout.
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = Number(
    config.get('HTTP_KEEP_ALIVE_TIMEOUT_MS', 65_000),
  );
  httpServer.headersTimeout = httpServer.keepAliveTimeout + 1_000;

  const port = Number(process.env.PORT) || config.get<number>('PORT', 4000);
  await app.listen(port);
  logger.log(`🚀 Application listening on port ${port}`);
}

bootstrap();
