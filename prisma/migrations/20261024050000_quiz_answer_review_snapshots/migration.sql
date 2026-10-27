ALTER TABLE "questions"
ADD COLUMN "created_by_id" TEXT,
ADD COLUMN "is_published" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "questions"
ADD CONSTRAINT "questions_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quiz_attempt_answers"
ADD COLUMN "selected_option_text" TEXT,
ADD COLUMN "correct_option_text" TEXT;

UPDATE "quiz_attempt_answers" AS answer
SET
  "selected_option_text" = selected_option."option_text",
  "correct_option_text" = COALESCE(
    (
      SELECT correct_option."option_text"
      FROM "question_options" AS correct_option
      WHERE correct_option."question_id" = answer."question_id"
        AND correct_option."is_correct" = TRUE
      ORDER BY correct_option."id"
      LIMIT 1
    ),
    selected_option."option_text"
  )
FROM "question_options" AS selected_option
WHERE answer."selected_option_id" = selected_option."id";

ALTER TABLE "quiz_attempt_answers"
ALTER COLUMN "selected_option_text" SET NOT NULL,
ALTER COLUMN "correct_option_text" SET NOT NULL;
