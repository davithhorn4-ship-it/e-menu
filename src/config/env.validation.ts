import * as Joi from 'joi';

const COOKIE_DOMAIN_PATTERN = /^\.?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

export const envValidationSchema = Joi.object({
  // --- App
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .required(),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  // --- URLs / Origins
  API_URL: Joi.string().uri().allow('', null).optional(),
  APP_URLS: Joi.string().required(),

  // --- Proxy: proxies trusted for X-Forwarded-For (src/common/security/trust-proxy.ts)
  TRUST_PROXY: Joi.string().trim().allow('').default('false'),

  // --- Uploads: folder for uploaded files (profile photos), served at /uploads/
  UPLOAD_DIR: Joi.string().trim().default('uploads'),

  // --- Request / Limits
  BODY_JSON_LIMIT: Joi.string().default('64kb'),
  BODY_URLENCODED_LIMIT: Joi.string().default('16kb'),

  // --- Swagger
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('true'),
  SWAGGER_PATH: Joi.string().trim().default('docs'),

  // --- Rate Limit
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_BLOCK_DURATION_SECONDS: Joi.number().integer().min(1).default(60),

  // --- Cookies
  COOKIE_DOMAIN: Joi.string()
    .allow('', null)
    .default(null)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().pattern(COOKIE_DOMAIN_PATTERN).required(),
    }),
  COOKIE_SECURE: Joi.string()
    .valid('true', 'false')
    .default('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('true').required(),
    }),
  COOKIE_SAMESITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .allow('', null)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().valid('none').required(),
    }),

  // --- Database
  DATABASE_URL: Joi.string().uri().required(),

  // --- JWT / Auth
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),
  JWT_REFRESH_COOKIE_DAYS: Joi.number().integer().min(1).max(60).default(7),
}).unknown(true);
