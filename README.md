# e-menu-api

HTTP API for the E-Menu project: NestJS 11, Prisma 7 and PostgreSQL.

It starts from the structure of `b-microfinance-api` (auth, users, role
permissions, the common HTTP layer, Prisma and Swagger). None of the loan or
accounting business logic came with it.

## What is included

| Area | Where | Notes |
| --- | --- | --- |
| Bootstrap | `src/main.ts` | CORS from `APP_URLS`, helmet, hpp, compression, JSON-only bodies, global validation, attach `req.user`, keep-alive tuning |
| Config | `src/config/env.validation.ts` | Joi schema. The app refuses to start when a required variable is missing |
| Prisma | `prisma.config.ts`, `prisma/schema.prisma`, `src/prisma` | `@prisma/adapter-pg`. Every write to `user` drops that user from the auth cache |
| HTTP layer | `src/common/http` | Error filter (`{ success:false, error, meta }`), `meta.path`/`meta.timestamp` interceptor, cookie options, Swagger |
| Guards | `src/common/guard` | Global order: throttle → JWT → CSRF origin (cookie auth) → `@Roles` → `@RequirePermissions` |
| Decorators | `src/common/decorators` | `@Public`, `@SkipCsrf`, `@Roles`, `@RequirePermissions` |
| Auth strategy | `src/common/strategy` | Passport JWT (Bearer or `accessToken` cookie) and a short-lived auth-user cache |
| Auth | `src/modules/auth` | Login, refresh with rotation (one session per device), logout, `GET /auth/me` |
| Users | `src/modules/users` | List/search/paginate, create, update, reset password, delete |
| Roles & permissions | `src/modules/permissions` | Permission catalog in code, synced into the DB on start; `GET/PUT /roles/:role/permissions`, `GET /auth/me/permissions` |
| Settings | `src/modules/settings` | Single-row app settings (`appName`, `defaultLocale`, `currency`) |
| Health | `src/common/http/health.controller.ts` | `GET /health` (liveness) and `GET /health/db` (database) |

### Roles

`ADMIN` and `DEVELOPER` have full access: they pass every `@Roles` and
`@RequirePermissions` check, and their grants cannot be edited. `MANAGER` and
`STAFF` get the keys stored in `role_permissions`. The seed writes the defaults
from `DEFAULT_ROLE_PERMISSIONS`. A `MANAGER` can only manage `STAFF` accounts.

To add a permission, add its key to
`src/modules/permissions/permission-catalog.ts`. It is inserted on the next start.

### Database tables

`users`, `refresh_sessions`, `permissions`, `role_permissions`, `app_settings`.
There is one migration: `prisma/migrations/20261113000000_init`.

## Run it locally

Requirements: Node 22+, npm, and PostgreSQL. Run `docker compose up -d db` to
start Postgres on `localhost:5432`.

```bash
npm install
```

```bash
cp .env.example .env
```

In `.env`, set `DATABASE_URL`, both JWT secrets and the `SEED_ADMIN_*` values.
The seed admin password must be at least 12 characters.

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run start:dev
```

- Health: <http://localhost:4000/health> and <http://localhost:4000/health/db>
- Swagger UI: <http://localhost:4000/docs> (JSON at `/docs-json`; turn it off with `SWAGGER_ENABLED=false`)

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | `prisma generate`, then `nest build` into `dist/` |
| `npm run typecheck` | `tsc --noEmit` for `src` and the seed |
| `npm test` | Unit tests (no database needed) |
| `npm run test:e2e` | Boots the app against `DATABASE_URL`: health, docs, auth refusal |
| `npm run db:migrate` / `db:migrate:dev` | `prisma migrate deploy` / `prisma migrate dev` |
| `npm run db:seed` | Permission catalog, default grants, and the first admin. It only adds rows |
| `npm run start:prod` | `node dist/main` |

## Docker

`Dockerfile` builds with `npm ci` and runs `node dist/main` as the `node` user.
`docker-compose.yml` runs Postgres, the API and a one-off `migrate` service:

```bash
docker compose --profile tools run --rm migrate
```

## Response shape

Success: `{ success: true, data, meta: { path, timestamp } }`.
Error: `{ success: false, error: { code, message, type }, meta: { statusCode, timestamp, path } }`.
Timestamps are ISO 8601 in UTC.
