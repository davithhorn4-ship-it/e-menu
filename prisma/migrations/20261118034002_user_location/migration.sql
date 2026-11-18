-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- Map position rules (Prisma cannot express CHECK constraints).
ALTER TABLE "users"
  ADD CONSTRAINT "users_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "users_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "users_lat_lng_together_check" CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
