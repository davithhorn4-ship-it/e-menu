import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function setupApiDocs(
  app: INestApplication,
  config: ConfigService,
  logger = new Logger('Swagger'),
) {
  const swaggerEnabled =
    config.get<string>('SWAGGER_ENABLED', 'true') !== 'false';
  const path = config.get<string>('SWAGGER_PATH', 'docs');
  const port = config.get<number>('PORT', 4000);
  const apiUrl = config.get<string>('API_URL')?.trim();

  if (!swaggerEnabled) {
    logger.log(`Swagger UI is disabled (path: /${path})`);
    return;
  }

  try {
    const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
    const jsonDocumentUrl = `/${path}-json`;

    const builder = new DocumentBuilder()
      .setTitle('E-Menu API')
      .setDescription('HTTP API documentation for the E-Menu API backend')
      .setVersion(process.env.npm_package_version ?? '0.0.1')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Send access token as Bearer <token>',
        },
        'bearer',
      )
      .addCookieAuth('accessToken', {
        type: 'apiKey',
        in: 'cookie',
        name: 'accessToken',
        description: 'Access token cookie',
      })
      .addCookieAuth('refreshToken', {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: 'Refresh token cookie',
      })
      // Default to the same origin that serves Swagger UI to avoid CORS and
      // hardcoded-port issues during local development.
      .addServer('/', 'Current origin')
      .addServer(`http://localhost:${port}`, 'Local API');

    if (apiUrl) {
      builder.addServer(apiUrl, 'Configured API');
    }

    const document = SwaggerModule.createDocument(app, builder.build(), {
      deepScanRoutes: true,
    });

    SwaggerModule.setup(path, app, document, {
      swaggerUrl: jsonDocumentUrl,
      jsonDocumentUrl,
      customSiteTitle: 'E-Menu API Docs',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });

    logger.log(`Swagger UI available at /${path}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);

    logger.error(`Swagger setup failed for /${path}: ${message}`);
  }
}
