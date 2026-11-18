-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_km" VARCHAR(80) NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_shop_id_sort_order_idx" ON "categories"("shop_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_shop_id_name_key" ON "categories"("shop_id", "name");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data rules Prisma cannot express (CHECK constraints).
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_check" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "categories_sort_order_check" CHECK ("sort_order" >= 0);
