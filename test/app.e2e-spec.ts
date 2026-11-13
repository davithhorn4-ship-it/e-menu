/**
 * Boots the real AppModule against DATABASE_URL (a migrated database).
 *   npm run test:e2e
 */
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from 'src/app.module';
import { HttpErrorFilter } from 'src/common/http/http-error.filter';
import { setupApiDocs } from 'src/common/http/swagger';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new HttpErrorFilter());
    setupApiDocs(app, app.get(ConfigService), new Logger('Swagger'));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health answers ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('GET /health/db reaches the database', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/db')
      .expect(200);
    expect(res.body).toMatchObject({ database: 'up' });
  });

  it('serves the OpenAPI document', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(res.body.info.title).toBe('E-Menu API');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/auth/login', '/users', '/roles', '/settings']),
    );
  });

  it('refuses protected routes without a token', async () => {
    const res = await request(app.getHttpServer()).get('/users').expect(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });
});
