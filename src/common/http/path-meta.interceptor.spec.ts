import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { PathMetaInterceptor } from './path-meta.interceptor';

describe('PathMetaInterceptor', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/auth/me' }),
    }),
  } as ExecutionContext;

  it('adds path and timestamp to successful object responses', (done) => {
    new PathMetaInterceptor()
      .intercept(context, {
        handle: () => of({ success: true, data: { status: 'ok' } }),
      })
      .subscribe((value) => {
        expect(value).toEqual({
          success: true,
          data: { status: 'ok' },
          meta: {
            path: '/auth/me',
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
            ),
          },
        });
        done();
      });
  });

  it('keeps meta the handler returned', (done) => {
    new PathMetaInterceptor()
      .intercept(context, {
        handle: () => of({ success: true, data: [], meta: { total: 3 } }),
      })
      .subscribe((value) => {
        expect(value.meta).toMatchObject({ total: 3, path: '/auth/me' });
        done();
      });
  });

  it('passes arrays through untouched', (done) => {
    new PathMetaInterceptor()
      .intercept(context, { handle: () => of([1, 2]) })
      .subscribe((value) => {
        expect(value).toEqual([1, 2]);
        done();
      });
  });
});
