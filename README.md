# Package access and grade progression

Package durations are calculated from the server-side activation time using UTC calendar months. The single-course package grants seven days of mentorship with three session requests and one month of practice access. A full-grade package grants two months of mentorship and four months of practice access. The Grade 9–12 entrance package grants six months of mentorship and twelve months of practice access.

Run the database migration and regenerate Prisma Client before deploying:

```sh
npx prisma migrate deploy
npx prisma generate
```

Administrators configure subjects as grade courses at `/api/v1/learning/courses`, provision student packages at `/api/v1/learning/packages`, and verify core-course completion at `/api/v1/learning/students/:studentId/courses/:courseId/completion`. Student access status is available at `/api/v1/learning/access`.

Quiz question retrieval and submissions require unexpired practice access. New mentorship conversations require active mentorship access matching the tutor's grade and subject; single-course session requests are capped at three. Expired attempts remain readable through `/api/v1/quiz/attempts`. Grade 10, 11, and 12 remain locked until every configured core course in each preceding grade is verified complete. Grades without configured core courses fail closed.

Administrators can create a course before configuring its single-course package offer. Offers support a standard ETB price and an optional custom override; checkout uses the effective price and stores an immutable payment snapshot. The existing package type determines access duration, so pricing changes do not alter expiration rules. Direct package provisioning remains available to administrators for supported operational workflows.

Approved tutors and administrators can import questions with `POST /api/v1/quiz/questions/bulk`. Send a JSON body with `subjectId`, `topicId`, `gradeLevel`, and 50–100 `questions`; each question contains `questionText`, 2–6 `options`, zero-based `correctOption`, and `explanation`. The topic must belong to the subject. The complete batch is validated before insertion and committed atomically. The admin content page provides a CSV template and accepts CSV exports with `questionText`, `option1`, `option2`, `correctOption`, and `explanation` headers; `option3`–`option6` are optional.

# Tutor verification and approval

Tutor accounts are created with pending status. Applicants submit their education category and credentials from the tutor application page. High-school tutors must upload a school student ID or official report card. University students, lecturers, and graduates must upload a university ID, official transcript, or degree/graduation certificate. These education-specific labels are validated in the context of the application while preserving the existing Prisma document enum values. Approval is blocked server-side until an accepted document is on file.

Tutor applications are submitted as multipart form data to `POST /api/v1/tutor-applications` with the profile fields, `documentType`, and a required `file`. The application and credential metadata are created together, so an application cannot enter the review queue without its required document.

Qualification files are stored outside the public uploads directory and are served only through authenticated applicant and administrator endpoints. Administrators review pending submissions at `/api/v1/admin/tutor-applications`, preview credentials at `/api/v1/admin/tutor-applications/:applicationId/documents/:documentId`, and approve or reject submissions through the corresponding action endpoints. Approval creates the tutor profile and changes the user's account status to approved in one database transaction; tutor features require that approved profile.

# Mentorship scheduling, Google Meet, and session chat

Approved tutors publish future availability from the tutor schedule page. Students book exactly three distinct slots with one tutor in the same UTC calendar week for one eligible course. Booking validates package coverage, course progression, tutor approval, and remaining mentorship sessions, then reserves the package quota and all slots in one database transaction. PostgreSQL prevents overlapping active tutor slots and enforces exactly three sessions in each persisted weekly series.

Tutors must connect Google Calendar before a booking can be completed. Configure a Google OAuth web application with the Calendar Events scope and register the backend callback URI as an authorized redirect URI. Set these backend environment variables:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth web application client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth web application client secret |
| `GOOGLE_REDIRECT_URI` | Exact callback URL, for example `http://localhost:3000/api/v1/scheduling/google/callback` for local development |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Random secret of at least 32 UTF-8 bytes used to encrypt stored refresh tokens |
| `FRONTEND_URL` | Frontend origin used after OAuth authorization, for example `http://localhost:5173` |

Generate a unique encryption key for each deployment and keep it in the deployment secret manager. Never reuse or commit production credentials. If Calendar is not configured or Google does not return a valid Meet conference link, booking fails and the application rolls back the three slots and package-session reservation rather than publishing a fabricated link.

Students use `/student/schedule` to select slots. Tutors connect Google Calendar and publish availability at `/tutor-portal/schedule`. Both dashboards show upcoming sessions and expose the Meet link during the 30-minute pre-session window and until the session ends. Each session has a participant-only chat at `/sessions/:sessionId`, with Socket.IO updates and authenticated private PDF/JPG/PNG resource downloads. Chat history and uploaded resources remain readable to session participants after the mentorship period, while sending is disabled after the session is cancelled or the enrollment's mentorship access expires.

The API is mounted at `/api/v1/scheduling`. Apply the scheduling migration and regenerate Prisma Client before starting the application:

```sh
npx prisma migrate deploy
npx prisma generate
```

# Chapa payments and tutor revenue

Admins configure standard/custom ETB offer prices from the course and package management screen or at `/admin/revenue`, and set a 5–10% platform commission. The initial commission is 10%; changing it affects new checkouts only. Each payment stores an immutable effective amount and commission snapshot. At checkout, students select an approved tutor who is eligible for the selected single-course, full-grade, or Grade 9–12 package. A verified payment creates the matching package enrollment and one available tutor payout in the same database transaction.

Configure these backend environment variables:

| Variable | Purpose |
| --- | --- |
| `CHAPA_SECRET_KEY` | Chapa API secret key for transaction initialization and verification |
| `CHAPA_WEBHOOK_SECRET` | Secret hash configured for the Chapa webhook |
| `CHAPA_CALLBACK_URL` | Public callback URL registered in Chapa, for example `https://api.example.com/api/v1/payments/callback` |
| `CHAPA_API_BASE_URL` | Optional API base URL; defaults to `https://api.chapa.co/v1` |
| `FRONTEND_URL` | Frontend origin used for the verified payment return |

Register `POST /api/v1/payments/webhook` (or `POST /api/v1/payments/callback`) as a Chapa transaction webhook and configure the same webhook secret hash. The endpoint validates the Chapa signature and then independently verifies every transaction against Chapa's API before activating access. The transaction `callback_url` is a signed server-to-server endpoint; Chapa redirects the customer separately to the frontend `return_url`. Do not put Chapa secrets in frontend configuration or commit them.

Students buy packages from `/student/packages`; payment status is verified at `/api/v1/payments/verify/:txRef`. Admins can review transaction and payout history and mark payouts as settled with the recorded bank/payment reference. Payout settlement is an auditable admin action; this implementation calculates and assigns tutor balances but does not initiate bank transfers automatically.

Apply the payment migration and regenerate Prisma Client before deployment:

```sh
npx prisma migrate deploy
npx prisma generate
```
