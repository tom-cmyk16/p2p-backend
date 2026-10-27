CREATE TABLE "learning_materials" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "created_by_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_materials_course_id_is_published_idx"
ON "learning_materials"("course_id", "is_published");

CREATE INDEX "learning_materials_topic_id_idx"
ON "learning_materials"("topic_id");

ALTER TABLE "learning_materials"
ADD CONSTRAINT "learning_materials_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_materials"
ADD CONSTRAINT "learning_materials_topic_id_fkey"
FOREIGN KEY ("topic_id") REFERENCES "topics"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_materials"
ADD CONSTRAINT "learning_materials_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
