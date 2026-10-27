CREATE TYPE "PaymentStatus" AS ENUM ('INITIALIZING', 'PENDING', 'PAID', 'FAILED');
CREATE TYPE "PayoutStatus" AS ENUM ('AVAILABLE', 'PAID');

CREATE TABLE "package_offers" (
    "id" TEXT NOT NULL,
    "package_type" "LearningPackageType" NOT NULL,
    "course_id" TEXT,
    "grade_level" "GradeLevel",
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "package_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "package_offers_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "package_offers_target_check" CHECK (
      ("package_type" = 'SINGLE_COURSE' AND "course_id" IS NOT NULL AND "grade_level" IS NULL)
      OR ("package_type" = 'FULL_GRADE' AND "course_id" IS NULL AND "grade_level" IS NOT NULL)
      OR ("package_type" = 'ENTRANCE_GRADE_9_12' AND "course_id" IS NULL AND "grade_level" IS NULL)
    )
);

CREATE TABLE "payment_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "commission_bps" INTEGER NOT NULL DEFAULT 1000,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_config_commission_check" CHECK ("commission_bps" BETWEEN 500 AND 1000)
);

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tx_ref" TEXT NOT NULL,
    "chapa_reference" TEXT,
    "student_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "package_type" "LearningPackageType" NOT NULL,
    "course_id" TEXT,
    "grade_level" "GradeLevel",
    "amount_minor" INTEGER NOT NULL,
    "commission_bps" INTEGER NOT NULL,
    "commission_minor" INTEGER NOT NULL,
    "tutor_amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIALIZING',
    "checkout_url" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_check" CHECK ("amount_minor" > 0),
    CONSTRAINT "payments_split_check" CHECK ("commission_minor" + "tutor_amount_minor" = "amount_minor"),
    CONSTRAINT "payments_commission_check" CHECK ("commission_bps" BETWEEN 500 AND 1000)
);

CREATE TABLE "tutor_payouts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "status" "PayoutStatus" NOT NULL DEFAULT 'AVAILABLE',
    "payout_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    CONSTRAINT "tutor_payouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tutor_payouts_amount_check" CHECK ("amount_minor" >= 0)
);

ALTER TABLE "package_enrollments"
  ALTER COLUMN "provisioned_by_id" DROP NOT NULL,
  ADD COLUMN "payment_id" TEXT,
  ADD COLUMN "assigned_tutor_id" TEXT;

ALTER TABLE "package_enrollments"
  DROP CONSTRAINT "package_enrollments_provisioned_by_id_fkey",
  ADD CONSTRAINT "package_enrollments_provisioned_by_id_fkey"
  FOREIGN KEY ("provisioned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "package_enrollments_payment_id_key" ON "package_enrollments"("payment_id");
CREATE INDEX "package_offers_package_type_active_idx" ON "package_offers"("package_type", "active");
CREATE UNIQUE INDEX "payments_tx_ref_key" ON "payments"("tx_ref");
CREATE INDEX "payments_student_id_created_at_idx" ON "payments"("student_id", "created_at");
CREATE INDEX "payments_tutor_id_status_created_at_idx" ON "payments"("tutor_id", "status", "created_at");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
CREATE UNIQUE INDEX "tutor_payouts_payment_id_key" ON "tutor_payouts"("payment_id");
CREATE INDEX "tutor_payouts_tutor_id_status_created_at_idx" ON "tutor_payouts"("tutor_id", "status", "created_at");

ALTER TABLE "package_offers"
  ADD CONSTRAINT "package_offers_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_tutor_id_fkey"
  FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tutor_payouts"
  ADD CONSTRAINT "tutor_payouts_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tutor_payouts_tutor_id_fkey"
  FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_enrollments"
  ADD CONSTRAINT "package_enrollments_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "package_enrollments_assigned_tutor_id_fkey"
  FOREIGN KEY ("assigned_tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "payment_config" ("id", "commission_bps", "updated_at")
VALUES ('default', 1000, CURRENT_TIMESTAMP);
