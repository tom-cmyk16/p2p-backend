#!/usr/bin/env bash
# =============================================================
# Writes the Prisma multi-file schema into prisma/schema/
# Run from your backend/ folder.
# =============================================================
set -e

mkdir -p prisma/schema

# -------------------------------------------------------------
# schema.prisma — generator, datasource, and shared/cross-domain enums
# -------------------------------------------------------------
cat > prisma/schema/schema.prisma << 'EOF'
// =============================================================
// Root schema file: generator, datasource, and enums shared
// across more than one domain file (GradeLevel, UserRole, AccountStatus).
// Domain-specific enums live in their own files.
// =============================================================

generator client {
  provider = "prisma-client"
  output   = "../../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  STUDENT
  TUTOR
  ADMIN
}

enum AccountStatus {
  PENDING
  APPROVED
  SUSPENDED
  BANNED
}

// Shared because it's used by StudentProfile, TutorApplication,
// TutorProfile, TutorSubject, and Question/QuizAttempt.
enum GradeLevel {
  GRADE_8
  GRADE_10
  GRADE_12
}
EOF

# -------------------------------------------------------------
# user.prisma — Region, User, StudentProfile
# -------------------------------------------------------------
cat > prisma/schema/user.prisma << 'EOF'
// =============================================================
// User domain: Region, User, StudentProfile
// =============================================================

model Region {
  id    String @id @default(cuid())
  name  String @unique

  users User[]

  @@map("regions")
}

model User {
  id           String        @id @default(cuid())
  fullName     String        @map("full_name")
  phoneOrEmail String        @unique @map("phone_or_email")
  passwordHash String        @map("password_hash")
  role         UserRole      @default(STUDENT)
  status       AccountStatus @default(APPROVED)
  regionId     String?       @map("region_id")
  region       Region?       @relation(fields: [regionId], references: [id], onDelete: SetNull)
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")

  // Reverse relations
  studentProfile       StudentProfile?
  tutorProfile         TutorProfile?          @relation("TutorIdentity")
  applicationsFiled    TutorApplication[]     @relation("ApplicantApplications")
  applicationsReviewed TutorApplication[]     @relation("ReviewerApplications")
  approvedTutorProfiles TutorProfile[]        @relation("ApprovedByAdmin")
  sentMessages         Message[]              @relation("MessageSender")
  reportsFiled         Report[]               @relation("ReportsFiled")
  reportsReviewed      Report[]               @relation("ReportsReviewed")
  reportsAgainst       Report[]               @relation("ReportedUser")

  // NOTE ON DELETE POLICY: User rows should never be hard-deleted in
  // production (suspend/ban via `status` instead) — this is enforced
  // structurally: Message.sender and Report.reporter both use
  // onDelete: Restrict below, so the DB itself blocks deleting a user
  // who has ever sent a message or filed a report.

  @@index([role])
  @@index([status])
  @@map("users")
}

model StudentProfile {
  userId     String     @id @map("user_id")
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  gradeLevel GradeLevel @map("grade_level")

  quizAttempts  QuizAttempt[]
  conversations Conversation[]
  ratingsGiven  Rating[]

  @@map("student_profiles")
}
EOF

# -------------------------------------------------------------
# tutor.prisma — TutorApplication, TutorQualificationDocument,
# TutorProfile, TutorSubject
# -------------------------------------------------------------
cat > prisma/schema/tutor.prisma << 'EOF'
// =============================================================
// Tutor domain: application/approval workflow + active tutor profile
// =============================================================

enum TutorEducationLevel {
  HIGH_SCHOOL
  UNIVERSITY
}

enum ApplicationStatus {
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
}

enum DocumentType {
  NATIONAL_ID
  STUDENT_ID_CARD
  TRANSCRIPT
  CERTIFICATE
  RECOMMENDATION_LETTER
  OTHER
}

model TutorApplication {
  id                String              @id @default(cuid())
  userId            String              @map("user_id")
  applicant         User                @relation("ApplicantApplications", fields: [userId], references: [id], onDelete: Cascade)
  educationLevel    TutorEducationLevel @map("education_level")
  institutionName   String              @map("institution_name")
  currentGradeLevel GradeLevel?         @map("current_grade_level")
  fieldOfStudy      String?             @map("field_of_study")
  yearOfStudy       Int?                @map("year_of_study")
  bio               String              @db.Text
  status            ApplicationStatus   @default(SUBMITTED)
  rejectionReason   String?             @db.Text @map("rejection_reason")
  reviewedById      String?             @map("reviewed_by")
  reviewedBy        User?               @relation("ReviewerApplications", fields: [reviewedById], references: [id], onDelete: SetNull)
  submittedAt       DateTime            @default(now()) @map("submitted_at")
  reviewedAt        DateTime?           @map("reviewed_at")

  documents        TutorQualificationDocument[]
  approvedProfile  TutorProfile?                 @relation("ApprovedApplication")

  @@index([userId])
  @@index([status])
  @@map("tutor_applications")
}

model TutorQualificationDocument {
  id            String           @id @default(cuid())
  applicationId String           @map("application_id")
  application   TutorApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  documentType  DocumentType     @map("document_type")
  fileUrl       String           @map("file_url")
  fileName      String           @map("file_name")
  uploadedAt    DateTime         @default(now()) @map("uploaded_at")

  @@index([applicationId])
  @@map("tutor_qualification_documents")
}

model TutorProfile {
  userId                String              @id @map("user_id")
  user                  User                @relation("TutorIdentity", fields: [userId], references: [id], onDelete: Cascade)
  approvedApplicationId String              @unique @map("approved_application_id")
  approvedApplication   TutorApplication    @relation("ApprovedApplication", fields: [approvedApplicationId], references: [id], onDelete: Restrict)
  bio                   String              @db.Text
  educationLevel        TutorEducationLevel @map("education_level")
  institutionName       String              @map("institution_name")
  currentGradeLevel     GradeLevel?         @map("current_grade_level")
  fieldOfStudy          String?             @map("field_of_study")
  yearOfStudy           Int?                @map("year_of_study")
  approvedById          String              @map("approved_by")
  approvedBy            User                @relation("ApprovedByAdmin", fields: [approvedById], references: [id], onDelete: Restrict)
  approvedAt            DateTime            @default(now()) @map("approved_at")

  subjects        TutorSubject[]
  conversations   Conversation[]
  ratingsReceived Rating[]

  @@map("tutor_profiles")
}

model TutorSubject {
  tutorId    String       @map("tutor_id")
  tutor      TutorProfile @relation(fields: [tutorId], references: [userId], onDelete: Cascade)
  subjectId  String       @map("subject_id")
  subject    Subject      @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  gradeLevel GradeLevel   @map("grade_level")

  @@id([tutorId, subjectId, gradeLevel])
  @@map("tutor_subjects")
}
EOF

# -------------------------------------------------------------
# quiz.prisma — Subject, Topic, Question, QuestionOption,
# QuizAttempt, QuizAttemptAnswer
# -------------------------------------------------------------
cat > prisma/schema/quiz.prisma << 'EOF'
// =============================================================
// Quiz domain: Subject/Topic taxonomy, question bank, attempts
// =============================================================

model Subject {
  id   String @id @default(cuid())
  name String @unique

  topics        Topic[]
  tutorSubjects TutorSubject[]
  quizAttempts  QuizAttempt[]

  @@map("subjects")
}

model Topic {
  id        String  @id @default(cuid())
  subjectId String  @map("subject_id")
  subject   Subject @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  name      String

  questions Question[]

  @@unique([subjectId, name])
  @@index([subjectId])
  @@map("topics")
}

model Question {
  id           String     @id @default(cuid())
  topicId      String     @map("topic_id")
  topic        Topic      @relation(fields: [topicId], references: [id], onDelete: Cascade)
  gradeLevel   GradeLevel @map("grade_level")
  questionText String     @db.Text @map("question_text")
  explanation  String     @db.Text

  options        QuestionOption[]
  attemptAnswers QuizAttemptAnswer[]

  @@index([topicId])
  @@index([gradeLevel])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(cuid())
  questionId String   @map("question_id")
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  optionText String   @map("option_text")
  isCorrect  Boolean  @default(false) @map("is_correct")

  attemptAnswers QuizAttemptAnswer[]

  @@index([questionId])
  @@map("question_options")
}

model QuizAttempt {
  id          String         @id @default(cuid())
  studentId   String         @map("student_id")
  student     StudentProfile @relation(fields: [studentId], references: [userId], onDelete: Cascade)
  subjectId   String         @map("subject_id")
  subject     Subject        @relation(fields: [subjectId], references: [id], onDelete: Cascade)
  gradeLevel  GradeLevel     @map("grade_level")
  score       Int
  startedAt   DateTime       @default(now()) @map("started_at")
  completedAt DateTime?      @map("completed_at")

  answers QuizAttemptAnswer[]

  @@index([studentId])
  @@index([subjectId])
  @@map("quiz_attempts")
}

model QuizAttemptAnswer {
  id               String         @id @default(cuid())
  attemptId        String         @map("attempt_id")
  attempt          QuizAttempt    @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  questionId       String         @map("question_id")
  question         Question       @relation(fields: [questionId], references: [id], onDelete: Cascade)
  selectedOptionId String         @map("selected_option_id")
  selectedOption   QuestionOption @relation(fields: [selectedOptionId], references: [id], onDelete: Cascade)
  isCorrect        Boolean        @map("is_correct")

  // Production addition: a question can only be answered once per attempt.
  @@unique([attemptId, questionId])
  @@index([attemptId])
  @@map("quiz_attempt_answers")
}
EOF

# -------------------------------------------------------------
# chat.prisma — Conversation, Message
# -------------------------------------------------------------
cat > prisma/schema/chat.prisma << 'EOF'
// =============================================================
// Chat domain: Conversation, Message
// =============================================================

enum ConversationStatus {
  ACTIVE
  CLOSED
}

enum MessageType {
  TEXT
  IMAGE
  DOCUMENT
}

enum MessageStatus {
  SENT
  DELIVERED
  READ
}

model Conversation {
  id        String             @id @default(cuid())
  studentId String             @map("student_id")
  student   StudentProfile     @relation(fields: [studentId], references: [userId], onDelete: Cascade)
  tutorId   String             @map("tutor_id")
  tutor     TutorProfile       @relation(fields: [tutorId], references: [userId], onDelete: Cascade)
  status    ConversationStatus @default(ACTIVE)
  createdAt DateTime           @default(now()) @map("created_at")

  messages Message[]
  rating   Rating?
  reports  Report[]

  // Production addition: one conversation thread per student-tutor pair.
  @@unique([studentId, tutorId])
  @@index([studentId])
  @@index([tutorId])
  @@map("conversations")
}

model Message {
  id             String        @id @default(cuid())
  conversationId String        @map("conversation_id")
  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  senderId       String        @map("sender_id")
  sender         User          @relation("MessageSender", fields: [senderId], references: [id], onDelete: Restrict)
  type           MessageType   @default(TEXT)
  textContent    String?       @db.Text @map("text_content")
  fileUrl        String?       @map("file_url")
  fileName       String?       @map("file_name")
  status         MessageStatus @default(SENT)
  isDeleted      Boolean       @default(false) @map("is_deleted")
  sentAt         DateTime      @default(now()) @map("sent_at")

  reports Report[]

  @@index([conversationId])
  @@index([senderId])
  @@map("messages")
}
EOF

# -------------------------------------------------------------
# feedback.prisma — Rating, Report
# -------------------------------------------------------------
cat > prisma/schema/feedback.prisma << 'EOF'
// =============================================================
// Feedback & safety domain: Rating, Report
// =============================================================

enum ReportTargetType {
  MESSAGE
  CONVERSATION
  USER_PROFILE
}

enum ReportStatus {
  PENDING
  REVIEWED
  ACTION_TAKEN
  DISMISSED
}

model Rating {
  id             String       @id @default(cuid())
  conversationId String       @unique @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  studentId      String       @map("student_id")
  student        StudentProfile @relation(fields: [studentId], references: [userId], onDelete: Cascade)
  tutorId        String       @map("tutor_id")
  tutor          TutorProfile @relation(fields: [tutorId], references: [userId], onDelete: Cascade)
  score          Int
  comment        String?      @db.Text
  createdAt      DateTime     @default(now()) @map("created_at")

  // conversationId is @unique, which enforces "one rating per conversation"
  // at the database level — stronger than the original composite-unique idea,
  // since a Conversation is already exactly one student + one tutor.
  @@index([tutorId])
  @@map("ratings")
}

model Report {
  id                     String           @id @default(cuid())
  reporterId             String           @map("reporter_id")
  reporter               User             @relation("ReportsFiled", fields: [reporterId], references: [id], onDelete: Restrict)
  targetType             ReportTargetType @map("target_type")

  // Split into three typed, nullable FKs instead of one polymorphic
  // target_id — Prisma (and relational DBs generally) can't enforce
  // a single FK pointing at three different tables. Exactly one of
  // these three should be set, matching `targetType`; enforce that
  // pairing in application/service-layer validation.
  reportedMessageId      String?          @map("reported_message_id")
  reportedMessage        Message?         @relation(fields: [reportedMessageId], references: [id], onDelete: Cascade)
  reportedConversationId String?          @map("reported_conversation_id")
  reportedConversation   Conversation?    @relation(fields: [reportedConversationId], references: [id], onDelete: Cascade)
  reportedUserId         String?          @map("reported_user_id")
  reportedUser           User?            @relation("ReportedUser", fields: [reportedUserId], references: [id], onDelete: Cascade)

  reason      String       @db.Text
  status      ReportStatus @default(PENDING)
  reviewedById String?     @map("reviewed_by")
  reviewedBy  User?        @relation("ReportsReviewed", fields: [reviewedById], references: [id], onDelete: SetNull)
  createdAt   DateTime     @default(now()) @map("created_at")
  resolvedAt  DateTime?    @map("resolved_at")

  @@index([status])
  @@index([reporterId])
  @@map("reports")
}
EOF

echo "== Formatting and validating the schema =="
npx prisma format
npx prisma validate

echo "== Done. All 6 files written to prisma/schema/ =="