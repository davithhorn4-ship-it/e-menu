// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger as PinoLogger } from 'nestjs-pino';
import {
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.set('trust proxy', 1);
  app.useLogger(app.get(PinoLogger));
  // First middleware so the timing covers CORS, auth, guards and handlers.
  app.use(serverTimingMiddleware);

  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

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

  app.use((req, res, next) => {
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

  if (!isProd) {
    app.use((req, res, next) => {
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
  app.use((req, _res, next) => {
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
      if (!contentType || !req.is || !req.is('application/json')) {
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

  // ---- Attach req.user if token exists ----
  const authService = app.get(AuthService);
  app.use((req, _res, next) => {
    (async () => {
      // Skip on OPTIONS (already handled above, but safe)
      if (req.method === 'OPTIONS') return;

      const authHeader = req.headers?.authorization as string | undefined;
      const bearer =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : undefined;

      const cookieToken = req?.cookies?.accessToken;
      const token = bearer ?? cookieToken;

      if (!token) return;

      try {
        const user = await authService.getUserFromAccessToken(
          token,
          // Share the lookup with JwtStrategy so the guard does not load the
          // same user again for this request.
          (sub, loaded) => setAuthUserLookup(req, { token, sub, user: loaded }),
        );
        req.user = {
          userId: user.id,
          email: user.email,
          role: user.role,
        };
      } catch (err) {
        if (!(err as any)?.getStatus || (err as any).getStatus?.() >= 500) {
          logger.warn(`Auth attach middleware failed: ${err}`);
        }
      }
    })()
      .then(() => next())
      .catch(() => next());
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
