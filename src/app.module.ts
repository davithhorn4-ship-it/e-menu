// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import crypto from 'crypto';
import type { IncomingMessage } from 'http';

import { envValidationSchema } from './config/env.validation';
import { CsrfOriginGuard } from './common/guard/csrf-origin.guard';
import { JwtAuthGuard } from './common/guard/jwt-auth.guard';
import { PermissionsGuard } from './common/guard/permissions.guard';
import { RolesGuard } from './common/guard/roles.guard';
import { HealthController } from './common/http/health.controller';
import { PathMetaInterceptor } from './common/http/path-meta.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AppSettingsModule } from './modules/settings/app-settings.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

const envFilePaths = [
  process.env.ENV_FILE,
  `.env.${process.env.NODE_ENV || 'development'}`,
  '.env',
].filter((value): value is string => !!value);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths,
      ignoreEnvFile: false,
      expandVariables: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: false,
      },
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isDev = cfg.get('NODE_ENV') !== 'production';

        return {
          pinoHttp: {
            level: cfg.get<string>('LOG_LEVEL') ?? (isDev ? 'debug' : 'info'),
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    messageKey: 'msg',
                  },
                }
              : undefined,

            genReqId: (req) =>
              (req.headers['x-request-id'] as string) || crypto.randomUUID(),

            customProps: (req) => {
              const r = req as IncomingMessage & {
                id?: unknown;
                user?: { userId?: string; id?: string; role?: string };
              };
              return {
                reqId: r.id,
                userId: r.user?.userId ?? r.user?.id ?? null,
                userRole: r.user?.role ?? null,
              };
            },

            customLogLevel: (_req, res, err) => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },

            autoLogging: {
              ignore: (req) =>
                req.url === '/health' || req.method === 'OPTIONS',
            },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                // Login and refresh set the access and refresh tokens here.
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.*.password',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: seconds(config.get<number>('THROTTLE_TTL_SECONDS', 60)),
            limit: config.get<number>('THROTTLE_LIMIT', 120),
            blockDuration: seconds(
              config.get<number>('THROTTLE_BLOCK_DURATION_SECONDS', 60),
            ),
          },
        ],
        errorMessage: 'Too many requests, please try again later.',
      }),
    }),

    PrismaModule,
    UsersModule,
    AuthModule,
    PermissionsModule,
    AppSettingsModule,
  ],

  controllers: [HealthController],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: PathMetaInterceptor },
  ],
})
export class AppModule {}
