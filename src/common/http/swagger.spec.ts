import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { applyDevLoginExample } from './swagger';

const placeholder = { email: 'admin@example.com', password: 'change-me' };

const doc = () => ({
  paths: {
    '/auth/login': {
      post: {
        requestBody: {
          content: {
            'application/json': {
              examples: { default: { value: { ...placeholder } } },
            },
          },
        },
      },
    },
  },
});

const exampleOf = (d: ReturnType<typeof doc>) =>
  d.paths['/auth/login'].post.requestBody.content['application/json'].examples
    .default.value;

const config = (env: Record<string, string>) => new ConfigService(env);

const silent = new Logger('test');
jest.spyOn(silent, 'log').mockImplementation(() => undefined);

describe('applyDevLoginExample', () => {
  const dev = {
    NODE_ENV: 'development',
    SWAGGER_LOGIN_EMAIL: 'dev@e-menu.test',
    SWAGGER_LOGIN_PASSWORD: 'dev-password-123',
  };

  it('fills the login example outside production', () => {
    const d = doc();
    applyDevLoginExample(d, config(dev), silent);
    expect(exampleOf(d)).toEqual({
      email: 'dev@e-menu.test',
      password: 'dev-password-123',
    });
  });

  it('keeps the placeholder in production', () => {
    const d = doc();
    applyDevLoginExample(d, config({ ...dev, NODE_ENV: 'production' }), silent);
    expect(exampleOf(d)).toEqual(placeholder);
  });

  it('keeps the placeholder when the variables are missing', () => {
    const d = doc();
    applyDevLoginExample(d, config({ NODE_ENV: 'development' }), silent);
    expect(exampleOf(d)).toEqual(placeholder);
  });
});
