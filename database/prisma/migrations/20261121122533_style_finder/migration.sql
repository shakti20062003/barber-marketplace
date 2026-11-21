-- CreateEnum
CREATE TYPE "StyleGender" AS ENUM ('MEN', 'WOMEN');

-- CreateTable
CREATE TABLE "hair_styles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "StyleGender" NOT NULL,
    "description" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "maintenance" TEXT NOT NULL,
    "faceShapeFit" JSONB NOT NULL,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hair_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hair_styles_gender_active_idx" ON "hair_styles"("gender", "active");

-- CreateIndex
CREATE UNIQUE INDEX "hair_styles_name_gender_key" ON "hair_styles"("name", "gender");
