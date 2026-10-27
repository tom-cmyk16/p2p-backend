CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'CANCELLED');
CREATE TYPE "MentorshipSessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

CREATE TABLE "tutor_google_accounts" (
    "tutor_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "calendar_id" TEXT NOT NULL DEFAULT 'primary',
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tutor_google_accounts_pkey" PRIMARY KEY ("tutor_id")
);

CREATE TABLE "tutor_availability" (
    "id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tutor_availability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tutor_availability_time_check" CHECK ("ends_at" > "starts_at")
);

CREATE TABLE "mentorship_series" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mentorship_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mentorship_sessions" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "availability_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "meet_url" TEXT,
    "google_event_id" TEXT,
    "status" "MentorshipSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mentorship_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mentorship_sessions_time_check" CHECK ("ends_at" > "starts_at")
);

ALTER TABLE "messages" ADD COLUMN "session_id" TEXT;

CREATE UNIQUE INDEX "mentorship_series_enrollment_id_course_id_week_start_key"
ON "mentorship_series"("enrollment_id", "course_id", "week_start");
CREATE UNIQUE INDEX "mentorship_sessions_availability_id_key"
ON "mentorship_sessions"("availability_id");
CREATE INDEX "tutor_availability_tutor_id_starts_at_status_idx"
ON "tutor_availability"("tutor_id", "starts_at", "status");
CREATE INDEX "mentorship_series_student_id_week_start_idx"
ON "mentorship_series"("student_id", "week_start");
CREATE INDEX "mentorship_series_tutor_id_week_start_idx"
ON "mentorship_series"("tutor_id", "week_start");
CREATE INDEX "mentorship_sessions_student_id_starts_at_idx"
ON "mentorship_sessions"("student_id", "starts_at");
CREATE INDEX "mentorship_sessions_tutor_id_starts_at_idx"
ON "mentorship_sessions"("tutor_id", "starts_at");
CREATE INDEX "mentorship_sessions_course_id_starts_at_idx"
ON "mentorship_sessions"("course_id", "starts_at");
CREATE INDEX "messages_session_id_sent_at_idx"
ON "messages"("session_id", "sent_at");

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "tutor_availability"
ADD CONSTRAINT "tutor_availability_no_overlapping_active_slots"
EXCLUDE USING GIST (
    "tutor_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" IN ('AVAILABLE', 'BOOKED'));

ALTER TABLE "tutor_google_accounts"
ADD CONSTRAINT "tutor_google_accounts_tutor_id_fkey"
FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tutor_availability"
ADD CONSTRAINT "tutor_availability_tutor_id_fkey"
FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_series"
ADD CONSTRAINT "mentorship_series_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_series"
ADD CONSTRAINT "mentorship_series_tutor_id_fkey"
FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_series"
ADD CONSTRAINT "mentorship_series_enrollment_id_fkey"
FOREIGN KEY ("enrollment_id") REFERENCES "package_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_series"
ADD CONSTRAINT "mentorship_series_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentorship_series"
ADD CONSTRAINT "mentorship_series_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_series_id_fkey"
FOREIGN KEY ("series_id") REFERENCES "mentorship_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_availability_id_fkey"
FOREIGN KEY ("availability_id") REFERENCES "tutor_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "student_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_tutor_id_fkey"
FOREIGN KEY ("tutor_id") REFERENCES "tutor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_enrollment_id_fkey"
FOREIGN KEY ("enrollment_id") REFERENCES "package_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentorship_sessions"
ADD CONSTRAINT "mentorship_sessions_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
ADD CONSTRAINT "messages_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "mentorship_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "enforce_three_sessions_per_series"() RETURNS TRIGGER AS $$
DECLARE
    target_series_id TEXT;
    session_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'mentorship_series' THEN
        target_series_id := NEW."id";
    ELSIF TG_OP = 'DELETE' THEN
        target_series_id := OLD."series_id";
    ELSE
        target_series_id := NEW."series_id";
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "mentorship_series" WHERE "id" = target_series_id) THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO session_count
    FROM "mentorship_sessions"
    WHERE "series_id" = target_series_id;

    IF session_count <> 3 THEN
        RAISE EXCEPTION 'A weekly mentorship series must contain exactly three sessions';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "mentorship_series_requires_three_sessions"
AFTER INSERT ON "mentorship_series"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_three_sessions_per_series"();
CREATE CONSTRAINT TRIGGER "mentorship_sessions_require_three_per_series"
AFTER INSERT OR DELETE ON "mentorship_sessions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_three_sessions_per_series"();
