-- CreateEnum
CREATE TYPE "user_token_type" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'INVITE');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('USD', 'KHR');

-- CreateEnum
CREATE TYPE "locale" AS ENUM ('km', 'en');

-- CreateEnum
CREATE TYPE "shop_role" AS ENUM ('OWNER', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "user_token_type" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_km" TEXT NOT NULL DEFAULT '',
    "logo_url" TEXT,
    "default_language" "locale" NOT NULL DEFAULT 'km',
    "base_currency" "currency" NOT NULL DEFAULT 'USD',
    "show_second_currency" BOOLEAN NOT NULL DEFAULT true,
    "exchange_rate" INTEGER NOT NULL DEFAULT 4100,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "service_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_km" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "opening_hours" JSONB NOT NULL,
    "dine_in" BOOLEAN NOT NULL DEFAULT true,
    "takeaway" BOOLEAN NOT NULL DEFAULT true,
    "pickup" BOOLEAN NOT NULL DEFAULT false,
    "prep_target_minutes" INTEGER NOT NULL DEFAULT 15,
    "tax_percent" DECIMAL(5,2),
    "service_percent" DECIMAL(5,2),
    "order_prefix" VARCHAR(4) NOT NULL,
    "order_seq" INTEGER NOT NULL DEFAULT 0,
    "close_seq" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_members" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "shop_role" NOT NULL DEFAULT 'CASHIER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_member_branches" (
    "member_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_member_branches_pkey" PRIMARY KEY ("member_id","branch_id")
);

-- CreateIndex
CREATE INDEX "user_tokens_user_id_type_idx" ON "user_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "user_tokens_token_hash_idx" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "branches_shop_id_is_active_idx" ON "branches"("shop_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "branches_shop_id_order_prefix_key" ON "branches"("shop_id", "order_prefix");

-- CreateIndex
CREATE INDEX "shop_members_user_id_idx" ON "shop_members"("user_id");

-- CreateIndex
CREATE INDEX "shop_members_shop_id_role_idx" ON "shop_members"("shop_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "shop_members_shop_id_user_id_key" ON "shop_members"("shop_id", "user_id");

-- CreateIndex
CREATE INDEX "shop_member_branches_branch_id_idx" ON "shop_member_branches"("branch_id");

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_member_branches" ADD CONSTRAINT "shop_member_branches_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "shop_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_member_branches" ADD CONSTRAINT "shop_member_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data rules Prisma cannot express (CHECK constraints). Added by hand; Prisma
-- does not manage CHECK constraints, so later `migrate dev` runs keep them.
ALTER TABLE "shops"
  ADD CONSTRAINT "shops_tax_percent_check" CHECK ("tax_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "shops_service_percent_check" CHECK ("service_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "shops_exchange_rate_check" CHECK ("exchange_rate" > 0);

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_tax_percent_check" CHECK ("tax_percent" IS NULL OR "tax_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "branches_service_percent_check" CHECK ("service_percent" IS NULL OR "service_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "branches_prep_target_minutes_check" CHECK ("prep_target_minutes" BETWEEN 1 AND 600),
  ADD CONSTRAINT "branches_order_prefix_check" CHECK ("order_prefix" ~ '^[A-Z0-9]{1,4}$'),
  ADD CONSTRAINT "branches_seq_check" CHECK ("order_seq" >= 0 AND "close_seq" >= 0),
  ADD CONSTRAINT "branches_opening_hours_check" CHECK (jsonb_typeof("opening_hours") = 'array');

ALTER TABLE "user_tokens"
  ADD CONSTRAINT "user_tokens_attempts_check" CHECK ("attempts" >= 0);
