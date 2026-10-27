ALTER TYPE "GradeLevel" ADD VALUE 'GRADE_9' AFTER 'GRADE_8';
ALTER TYPE "GradeLevel" ADD VALUE 'GRADE_11' AFTER 'GRADE_10';

CREATE TYPE "LearningPackageType" AS ENUM ('SINGLE_COURSE', 'FULL_GRADE', 'ENTRANCE_GRADE_9_12');

CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "grade_level" "GradeLevel" NOT NULL,
    "is_core" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "package_type" "LearningPackageType" NOT NULL,
    "course_id" TEXT,
    "grade_level" "GradeLevel",
    "mentorship_months" INTEGER NOT NULL,
    "access_months" INTEGER NOT NULL,
    "live_session_count" INTEGER,
    "live_sessions_used" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mentorship_expires_at" TIMESTAMP(3) NOT NULL,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "provisioned_by_id" TEXT NOT NULL,
    CONSTRAINT "package_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_completions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "completed_by_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courses_subject_id_grade_level_key" ON "courses"("subject_id", "grade_level");
CREATE INDEX "courses_grade_level_is_core_idx" ON "courses"("grade_level", "is_core");
CREATE INDEX "package_enrollments_student_id_access_expires_at_idx" ON "package_enrollments"("student_id", "access_expires_at");
CREATE INDEX "package_enrollments_student_id_mentorship_expires_at_idx" ON "package_enrollments"("student_id", "mentorship_expires_at");
CREATE UNIQUE INDEX "course_completions_student_id_course_id_key" ON "course_completions"("student_id", "course_id");
CREATE INDEX "course_completions_student_id_completed_at_idx" ON "course_completions"("student_id", "completed_at");

ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_enrollments" ADD CONSTRAINT "package_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "package_enrollments" ADD CONSTRAINT "package_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_enrollments" ADD CONSTRAINT "package_enrollments_provisioned_by_id_fkey" FOREIGN KEY ("provisioned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD COLUMN "package_enrollment_id" TEXT;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_package_enrollment_id_fkey" FOREIGN KEY ("package_enrollment_id") REFERENCES "package_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_completions" ADD CONSTRAINT "course_completions_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
