-- CreateEnum
CREATE TYPE "CircleType" AS ENUM ('FIELD', 'INSTITUTION', 'REGION');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "city" TEXT,
ADD COLUMN     "region" TEXT;

-- CreateTable
CREATE TABLE "AcademicCircle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionZh" TEXT,
    "descriptionEn" TEXT,
    "type" "CircleType" NOT NULL,
    "fieldId" TEXT,
    "institution" TEXT,
    "region" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "avgScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "topPersonId" TEXT,
    "topPersonName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicCircle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicCircle_slug_key" ON "AcademicCircle"("slug");

-- CreateIndex
CREATE INDEX "AcademicCircle_type_idx" ON "AcademicCircle"("type");

-- CreateIndex
CREATE INDEX "AcademicCircle_slug_idx" ON "AcademicCircle"("slug");
