CREATE TYPE "PackagePricingMode" AS ENUM ('STANDARD', 'CUSTOM');

ALTER TABLE "package_offers"
ADD COLUMN "standard_amount_minor" INTEGER,
ADD COLUMN "custom_amount_minor" INTEGER,
ADD COLUMN "pricing_mode" "PackagePricingMode" NOT NULL DEFAULT 'STANDARD';

UPDATE "package_offers"
SET "standard_amount_minor" = "amount_minor";

ALTER TABLE "package_offers"
ALTER COLUMN "standard_amount_minor" SET NOT NULL;
