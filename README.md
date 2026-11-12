# MASTERY

**AI-powered learning recovery for Grade 8–9 Mathematics.**
Six specialist agents find the gap behind a learner's mistakes, design a targeted intervention, guide practice, verify recovery with fresh questions, and hand the teacher evidence and a recommended next step.

MASTERY is a hackathon prototype. All learners are fictional. A diagnosis is presented as an evidence-supported hypothesis, never a permanent label.

---

## Quick start

Requires **Node.js 20+** (the server uses native `fetch`, ESM and `node:test`).

```bash
npm install
npm run dev
```

- Client: <http://localhost:5173>
- API + SSE: <http://localhost:8787>
- Health check: <http://localhost:8787/api/health>

`npm run dev` runs the Express server and Vite together. The Vite client proxies `/api` to port `8787`.

### Production-style run

```bash
npm run build
npm start
```

Express serves the built client and API from <http://localhost:8787>.

### Vercel frontend and Render backend

- On Render, leave the root directory blank, use `npm ci` as the build command
  and `npm start` as the start command. Render supplies `PORT`.
- On Vercel, use the repository root, `npm run build` and output directory
  `dist`. Do not use `npm run dev` as the build command.
- `vercel.json` proxies `/api` requests to
  `https://mastery-583l.onrender.com` and serves the SPA for frontend routes.
  Update that destination if the Render service URL changes.
- Set backend variables such as `AI_PROVIDER=demo`, `MASTERY_THRESHOLD=80`
  and `DEMO_DELAY_MS=450` on Render. OpenAI credentials, if used, belong on
  Render only; do not use `VITE_` variables for secrets.
- Push changes to the connected branch and redeploy Vercel. Check
  `/api/health`, `/api/learners` and a frontend deep link on the Vercel URL.

Render's default filesystem is ephemeral: `server/data/db.json` can be lost
on restart or redeploy. For a single-instance demo, a paid Render persistent
disk can be mounted at `/var/data`; set `MASTERY_DATA_DIR=/var/data` on Render.
This starts a fresh database on the disk unless you deliberately migrate the
existing data. The JSON repository is not a shared production database or
suitable for multiple processes or instances. The prototype has no
authentication and its demo reset endpoint is public: use fictional data only
and secure access before storing real learner information.

### Other scripts

```bash
npm test        # end-to-end API tests (full recovery + retry + validation)
npm run reset   # reset server/data/db.json to the seeded demo
```

Demo data can also be reset from the sidebar in the UI.

---

## Demo script

### 1. Thabo Mokoena — the complete recovery journey

Thabo starts with no learning cycle.

1. Open **Overview → Thabo Mokoena → Enter learner workspace**.
2. Start the diagnostic. His sample answers are **pre-filled and editable**:
   `d1: -1`, `d2: 3`, `d3: 3`, `d4: 6`, `d5: 3` → **2/5**.
3. Submit. The Assessment, Diagnostic and Learning Designer agents run in sequence:
   - diagnosis: **negative number operations**
   - evidence: three wrong answers, including subtracting a negative and applying a sign
   - intervention: number line, three worked examples, three practice questions.
4. Work through the lesson and **Guided practice**. Each answer is checked by the Tutor Agent; hints appear before the correct result is revealed. The sample practice answers are pre-filled and can be edited.
5. Finish practice. The Mastery Agent creates five **fresh** questions, not repeats of the diagnostic.
6. Submit the pre-filled mastery answers. Attempt 1 is **4/5 (80%)**, meeting the threshold. Thabo completes the cycle and the Teacher Insight Agent writes the teacher summary.

**To see the adaptation path:** on the mastery check, change two correct answers to wrong options so the score falls below 80%. The Mastery Agent returns `retry`, the Learning Designer produces an **adapted attempt 2** with slower steps and fresh practice, and a second mastery check follows. If attempt 2 is also below 80%, the cycle completes with a teacher-review recommendation.

### 2. Sipho Ndlovu — recovered

A seeded completed cycle: **2/5** diagnostic → **5/5** mastery after one intervention. Open his teacher profile to see the full evidence trail and teacher insight.

### 3. Lerato Dlamini — needs support

A seeded completed cycle: **0/5** diagnostic → two mastery attempts at **3/5**, below the threshold. The cycle is marked `complete_support`; the teacher insight recommends a teacher-led review rather than another independent retry.

Switch learners inside the learner workspace or open **Teacher Dashboard → learner profile**.

---

## The six agents

| Agent | Responsibility | Key output |
| --- | --- | --- |
| **Assessment** | Scores each diagnostic item, identifies recurring error patterns, cites misconceptions | `assessmentReportSchema` |
| **Diagnostic** | Forms a gap hypothesis, distinguishes a surface slip from a concept gap, states confidence | `diagnosticSchema` |
| **Learning Designer** | Builds a short intervention with sections, number line, worked examples and practice; adapts on retry | `interventionSchema` |
| **Tutor** | Checks practice answers, gives hints/feedback, summarises readiness | `tutorResultSchema` |
| **Mastery** | Generates fresh follow-up questions, evaluates against the threshold, compares with the initial score | `masteryQuestionsSchema`, `masteryResultSchema` |
| **Teacher Insight** | Converts the completed cycle into a concise teacher summary, evidence, recommendation and next step | `teacherInsightSchema` |

Every agent receives structured input, returns a structured object validated by **Zod**, and records start/completed/failed events.

### Orchestration guarantees

- The workflow is driven by the **submitted answers**, not a scripted animation.
- Each agent output is validated before persistence and before the next hand-off.
- Agent results are persisted after every step, so a refresh resumes the session.
- A failed step marks the session `error`; `LLM` failures fall back to a deterministic, validated result.
- Mastery is `80%` with a maximum of **2 attempts** (`server/config.js`).
- A failed first attempt triggers one adapted intervention; exhaustion or a pass runs Teacher Insight and completes the cycle.
- SSE publishes live agent events; the client also polls persisted session snapshots in case the stream is interrupted or buffered.

---

## Architecture

```text
server/
  agents/            six agent implementations (deterministic compute + provider call)
  orchestration/     learningRecoveryOrchestrator.js, eventBus.js
  providers/         demoProvider.js, openaiProvider.js, provider status
  validation/        Zod request, agent-output and provider-output schemas
  domain/            diagnostic and mastery question bank, skill labels
  auth/              scrypt credentials, session tokens, cookies, middleware
  db/                seed.js, store.js (JSON demo), classroomSessionRepository.js, postgres.js, migrations/
  services/          serialisation (strips answer keys), learner/teacher/classroom learning, progress, SSE stream
  routes/            Express API + SSE, teacher auth, classes, student access
  app.js/index.js    HTTP app, migrations and graceful shutdown

src/
  pages/             Overview, LearnerWorkspace, AgentActivity, TeacherDashboard,
                     TeacherLearnerDetail, NotFound
  pages/portal/      PortalLanding, TeacherLogin, TeacherSignup, StudentJoin,
                     TeacherClasses, TeacherClassDetail, ClassroomStudentProgress,
                     StudentHome, StudentLearning
  components/        AppShell, PortalShell, AuthLayout, RequireRole, LearningCycle,
                     AgentTimeline, Questionnaire, DiagnosisCard, LessonPanel,
                     PracticePanel, ResultSummary, WorkflowStepper, NumberLine,
                     AttemptCard, TeacherInsightPanel, shared UI primitives
  context/           app boot, learner selection, reset, toasts, classroom auth
  lib/               API client, live SSE hook, formatting, constants
```

### API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | status, provider mode, threshold, counts |
| `GET` | `/api/learners` | learner states for the workspace |
| `GET` | `/api/learners/:id/progress` | learner + current/latest session |
| `POST` | `/api/learning-sessions` | start or resume a cycle |
| `GET` | `/api/learning-sessions/:id` | session snapshot |
| `GET` | `/api/learning-sessions/:id/events` | **SSE** snapshot + live agent events |
| `POST` | `/api/learning-sessions/:id/diagnostic` | run Assessment → Diagnostic → Designer |
| `POST` | `/api/learning-sessions/:id/practice/check` | per-question Tutor check |
| `POST` | `/api/learning-sessions/:id/practice` | evaluate practice + prepare mastery |
| `POST` | `/api/learning-sessions/:id/mastery` | evaluate mastery, adapt or complete |
| `GET` | `/api/teacher/overview` | stats, learner rows, recent activity |
| `GET` | `/api/teacher/learners/:id` | full evidence and insight |
| `GET` | `/api/activity` | cross-learner event feed |
| `POST` | `/api/demo/reset` | restore seeded data |

Answer keys are stripped from every client payload except the explicit `demoAnswer` hint used for the demo learner.

---

## AI provider modes

### Demo (default, no keys required)

```env
AI_PROVIDER=demo
```

No model calls are made. Each agent computes a real result from the submitted answers and passes it through the same schema/provider contract. A small `DEMO_DELAY_MS` delay (default `450ms`) makes the hand-offs visible. The agent timeline shows real orchestrator events, not fake progress.

### OpenAI-compatible

Set these **server-side only** (copy `.env.example` to `.env`):

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=18000
```

Each agent makes a chat-completions request with a deterministic fallback object included as the required JSON shape. The response is parsed, validated with Zod, and used only if valid. On a network error, timeout, malformed JSON or schema failure, the server logs a warning and uses the validated fallback, so the learning cycle never breaks.

Diagnostic and practice scores, mastery questions and answer keys, mastery scores,
and the pass threshold come from the deterministic question bank and scoring
code, not the model. The model may provide hints and other educational text;
schema validation does not guarantee that generated explanations or diagnoses
are factually correct. Teacher review remains necessary.

Set these variables on Render and restart/redeploy the backend; Vercel does not
need them. The provider configuration is visible in the sidebar and returned by
`/api/health`, but it does not prove that a model call succeeded. Completed
agent events identify `openai` or `openai-fallback`. Model calls may incur
charges and transmit workflow inputs, including learner data, to the provider.
Only use fictional data unless appropriate privacy and access controls exist.

### Other settings

```env
PORT=8787
MASTERY_THRESHOLD=80
DEMO_DELAY_MS=450
```

`MASTERY_THRESHOLD` is read by the server. The client reads the active threshold from session/health data.

---

## Persistence

The prototype persists to `server/data/db.json` through a small repository layer with a serialised write queue. Set `MASTERY_DATA_DIR` to use another directory (for example a Render disk mount). The file is generated on first boot and gitignored at its default location. Writes use a temporary file and rename; a corrupt database is reported rather than silently overwritten. `npm run reset` or the UI reset action rebuilds the seeded learners, sessions and event history.

Classroom learning sessions are stored in Postgres in `learning_sessions`, not in the JSON file. Each row keeps the full orchestrator snapshot as JSONB plus indexed `class_id`, `student_id`, status, attempt and timestamps. The orchestrator is unchanged: it writes through a four-operation store contract (`findLearner`, `findSession`, `listSessionsForLearner`, `replaceSession`) that both the JSON demo store and the Postgres classroom repository implement.

No Supabase or hosted database is required for the demo, but the default Render filesystem is not durable.

---

## Classroom tenancy (pilot)

The `feat/class-tenancy` work adds a Postgres-backed, per-class tenancy layer next to the JSON demo. One teacher owns one or more classes, and each class has its own roster. Students join with a **class code + display name + 4-digit PIN**; they never need an email address.

The demo routes and JSON store are unchanged. Classroom routes return `503` until `DATABASE_URL` is set, and `npm test` skips the Postgres suite when no database is configured.

### Local setup

```bash
docker compose up -d          # Postgres 16 on localhost:5433
cp .env.example .env          # then uncomment DATABASE_URL
npm run db:migrate
npm run dev
```

Default connection string: `postgres://mastery:mastery@localhost:5433/mastery`.

### Data model

```text
teachers ──< classes ──< students ──< learning_sessions
                 │
                 └── auth_sessions (teacher or student principal)
```

- `teachers`: email (unique, case-insensitive), name, scrypt password hash, `email_verified_at`, plan (`pilot` or `paid`), `trial_ends_at` and `upgrade_requested_at`.
- `classes`: name, subject, grade, unique join code, owner (`teacher_id`) and the time the teacher attested to having school/guardian permission (`consent_attested_at`).
- `students`: display name (unique per class), scrypt PIN hash, last seen.
- `teacher_tokens`: single-use password-reset and email-verification tokens. Only a SHA-256 hash is stored; each row has a purpose, expiry and `used_at`.
- `learning_sessions`: the orchestrator snapshot as JSONB, plus `class_id`, `student_id`, status, attempt and timestamps for fast queries.
- `auth_sessions`: hashed random token, role, expiry. The browser only holds the raw token in an `HttpOnly`, `SameSite=Lax` cookie; Postgres stores a SHA-256 hash.

Every teacher route resolves the class through `teacher_id`, so a cross-teacher request returns `404`, not another teacher's data. Student routes only expose the student's own class, profile and learning sessions.

### Classroom API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/teacher/signup` | create a teacher account and session; sends a verification email and checks `PILOT_INVITE_CODE` when set |
| `POST` | `/api/auth/teacher/login` | teacher sign-in |
| `GET` | `/api/auth/config` | public signup flags (`teacherSignupOpen`, `pilotInviteRequired`) |
| `POST` | `/api/auth/teacher/forgot-password` | send a single-use reset link (always returns `200`) |
| `POST` | `/api/auth/teacher/reset-password` | consume a reset token, change the password and revoke every teacher session |
| `POST` | `/api/auth/teacher/verify-email` | consume a verification token |
| `POST` | `/api/auth/teacher/resend-verification` | send a fresh verification link to the signed-in teacher |
| `POST` | `/api/auth/student/login` | class code + name + PIN |
| `POST` | `/api/auth/logout` | delete the session and clear the cookie |
| `GET` | `/api/auth/me` | current teacher or student principal |
| `GET` | `/api/billing` | the teacher's plan, trial state, limits and usage |
| `POST` | `/api/billing/upgrade-request` | record an upgrade request and notify the pilot operator |
| `POST` | `/api/billing/webhook` | provider/operator plan activation, authenticated with `x-mastery-billing-secret` |
| `GET` | `/api/classes` | teacher's active classes with student counts |
| `GET` | `/api/classes/archived` | teacher's archived classes with student counts |
| `POST` | `/api/classes` | create a class and join code (requires `consentAttested: true`) |
| `GET` | `/api/classes/:classId` | class + roster (owner only) |
| `PATCH` | `/api/classes/:classId` | rename or change subject/grade |
| `DELETE` | `/api/classes/:classId` | archive a class (reversible) |
| `POST` | `/api/classes/:classId/restore` | restore an archived class |
| `POST` | `/api/classes/:classId/join-code` | rotate the class code; the old code stops working |
| `DELETE` | `/api/classes/:classId/permanent` | permanently delete the class, roster and learning sessions (`{ "confirm": true }`) |
| `GET` | `/api/classes/:classId/students` | roster without PINs |
| `GET` | `/api/classes/:classId/progress` | class stats + per-student learning status (owner only) |
| `GET` | `/api/classes/:classId/students/:studentId/progress` | one student's current cycle, mastery result and Teacher Insight (owner only) |
| `POST` | `/api/classes/:classId/students` | add a student; returns the PIN **once** |
| `POST` | `/api/classes/:classId/students/import` | import a CSV roster (first column is the name, up to 100 rows); returns a PIN for each new student |
| `POST` | `/api/classes/:classId/students/:studentId/pin` | reset a PIN; returns the new PIN once |
| `DELETE` | `/api/classes/:classId/students/:studentId/history` | erase one student's learning history but keep them on the roster |
| `DELETE` | `/api/classes/:classId/students/:studentId` | remove a student and erase their learning history |
| `GET` | `/api/student/class` | the signed-in student's class |
| `GET` | `/api/student/sessions` | the student's progress, current session and history |
| `POST` | `/api/student/sessions` | start or resume the student's own cycle |
| `GET` | `/api/student/sessions/:sessionId` | session snapshot (owner only) |
| `GET` | `/api/student/sessions/:sessionId/events` | **SSE** snapshot + live agent events (owner only) |
| `POST` | `/api/student/sessions/:sessionId/diagnostic` | run Assessment → Diagnostic → Designer |
| `POST` | `/api/student/sessions/:sessionId/practice/check` | per-question Tutor check |
| `POST` | `/api/student/sessions/:sessionId/practice` | evaluate practice + prepare mastery |
| `POST` | `/api/student/sessions/:sessionId/mastery` | evaluate mastery, adapt or complete |

Classroom sessions are resolved through the signed-in student. Another student's session ID returns `404`, and the student routes ignore any learner ID in the request body.

PINs are hashed with scrypt and can never be read back. If a student loses their PIN, the teacher resets it and reads the new one once.

### Portal UI

The classroom pilot has its own frontend, separate from the demo workspace:

| Route | Who | Purpose |
| --- | --- | --- |
| `/portal` | public | choose teacher or student access |
| `/privacy` | public | POPIA-aware pilot privacy notice |
| `/portal/teacher/login` | teacher | sign in, forgot-password link |
| `/portal/teacher/signup` | teacher | create an account (can be closed with `TEACHER_SIGNUP_OPEN=false`; asks for an invite code when `PILOT_INVITE_CODE` is set) |
| `/portal/teacher/forgot-password` | teacher | request a password-reset link |
| `/portal/teacher/reset-password` | teacher | choose a new password from an emailed token |
| `/portal/teacher/verify-email` | teacher | verify an emailed token |
| `/portal/teacher` | teacher | class list, create class with consent attestation, verification banner, archived classes and restore |
| `/portal/teacher/classes/:classId` | teacher | roster, class stats, edit/archive/restore, add student, CSV import, printable PIN slips, rotate code, remove student, erase history, delete class |
| `/portal/teacher/billing` | teacher | plan, trial countdown, usage, limits and upgrade request |
| `/portal/teacher/classes/:classId/students/:studentId` | teacher | one student's diagnosis, mastery result and Teacher Insight |
| `/portal/student` | student | join with class code + name + PIN |
| `/portal/student/home` | student | class card, class code, learning status and start/continue CTA |
| `/portal/student/learn` | student | the student's own six-agent learning cycle |

The demo workspace remains at `/`, `/learner`, `/activity` and `/teacher`. A **Class pilot** link in the demo sidebar opens `/portal`.

The portal UI was smoke-tested end to end in a headless browser: teacher signup → create class → add student → capture PIN → sign out → student join → student home → start diagnostic → intervention → practice → mastery → completed cycle. A second pass verified the teacher progress view: class stats → student progress → Teacher Insight → mastery evidence.

Classroom learning sessions are linked to the signed-in student and their class. The demo workspace and the classroom portal share the same six-agent orchestrator through a small session-store contract: the demo uses the JSON store, while classroom sessions are persisted in Postgres. The student home shows live status and opens `/portal/student/learn`, which starts or resumes the student's own cycle. Cross-student reads and writes return `404`.

Teachers see the class roster with a live learning status, then open any student to read the diagnostic evidence, intervention path, mastery result and the Teacher Insight summary. Progress endpoints resolve sessions through `class_id`, so a teacher cannot read another teacher's class or a student outside their roster.

### Pilot safety notes

- Creating a class requires an explicit `consentAttested: true` attestation. The timestamp is stored as `classes.consent_attested_at`. The UI also requires the teacher to tick a checkbox confirming school/guardian permission and that the privacy notice was shared.
- The public `/privacy` page explains what is stored, who can see it, the AI-provider data flow, retention and erasure. Add the school or operator's information-officer contact before using real learner data.
- A teacher can rotate a class code, erase one student's learning history, or permanently delete a class and all of its data. Removing a student also erases their learning history. These are the pilot erasure controls; they are not a substitute for a documented POPIA process.
- Unsafe API requests (`POST`, `PATCH`, `DELETE`) are rejected with `403` when the browser `Origin` is not the same host or listed in `CORS_ORIGINS`. Requests with no `Origin` (server-to-server, curl, tests) are allowed. Cookies remain `HttpOnly` and `SameSite=Lax`.
- API responses send `Cache-Control: no-store` and `X-Frame-Options: DENY`; production responses also send HSTS.
- Student sessions expire after `STUDENT_SESSION_HOURS` (default 12) because devices may be shared. Teacher sessions last `SESSION_TTL_DAYS` (default 30).
- Set `CORS_ORIGINS` to the exact frontend origins in production. Rotating a class code stops new sign-ins with the old code but does not sign out students who are already in a session.
- Set `SESSION_COOKIE_SECURE=true` in production (it defaults to true when `NODE_ENV=production`).
- `TEACHER_SIGNUP_OPEN=false` closes public teacher registration once the pilot cohort is enrolled. `PILOT_INVITE_CODE` adds a second gate: when set, signup requires that code and the form asks for it.
- Teacher email verification and password reset use single-use tokens stored only as SHA-256 hashes. Links expire after `EMAIL_VERIFICATION_TTL_HOURS` (default 48) and `PASSWORD_RESET_TTL_MINUTES` (default 30). A password reset revokes every existing teacher session.
- `EMAIL_DELIVERY=console` (default) prints the verification/reset link to the server log, which is enough for a supervised pilot. Set `EMAIL_DELIVERY=resend` with `RESEND_API_KEY` and `EMAIL_FROM` for real delivery. Set `APP_ORIGIN` so emailed links point at the deployed frontend.
- `REQUIRE_TEACHER_EMAIL_VERIFICATION=false` by default. Set it to `true` to block class management until the teacher opens the verification link; the dashboard shows a resend banner either way.
- Archiving a class keeps its roster and learning history but blocks new student sign-ins and hides it from the active list. Restoring it makes the same class code work again. Permanent deletion is still the only erasure path.
- CSV import takes the first column of each line, ignores an optional header row and skips names that are already on the roster or repeated in the file. Imported PINs are returned once, so the teacher can print the slips immediately.
- Auth endpoints are rate-limited per IP and path. The limiter is in-memory, so use Redis before running more than one API instance.
- A 4-digit PIN has 10,000 combinations. The rate limiter is the main brute-force control for a pilot; add a per-student lockout or longer PIN before a wider rollout.
- For POPIA, keep student data minimal (display name only), publish a privacy notice, and obtain guardian consent before using real learner data. The AI provider receives workflow content when `AI_PROVIDER=openai`; review that data flow before a real pilot.
- There is no audit log of teacher data access or deletion yet, and no automated retention job. Add both before a paid rollout.

### Pilot plans and conversion

Every new teacher starts on the free pilot. Limits and the trial length are configuration, not hard-coded:

| Plan | Active classes | Students per class | Trial |
| --- | --- | --- | --- |
| `pilot` | `PILOT_MAX_CLASSES` (5) | `PILOT_MAX_STUDENTS_PER_CLASS` (60) | `PILOT_TRIAL_DAYS` (60) |
| `paid` | `PAID_MAX_CLASSES` (50) | `PAID_MAX_STUDENTS_PER_CLASS` (300) | none |

Archived classes and their students do not count toward these limits. When a pilot expires, existing classes and student sign-ins keep working, but creating a class, adding or importing students, and restoring a class over the limit return `402` with an upgrade message. Nothing is deleted.

The teacher's **Plan** page shows the trial countdown, usage, limits and a request form. Requests set `teachers.upgrade_requested_at` and are emailed to `BILLING_NOTIFY_EMAIL` (or logged when it is empty). A request never charges a card by itself.

Activate a plan from an operator machine:

```bash
npm run plan:set -- teacher@school.example paid
# or put an account back on an expired pilot
npm run plan:set -- teacher@school.example pilot
```

A payment provider can call the webhook instead:

```bash
curl -X POST https://your-api.example/api/billing/webhook \
  -H "content-type: application/json" \
  -H "x-mastery-billing-secret: $BILLING_WEBHOOK_SECRET" \
  -d '{"email":"teacher@school.example","plan":"paid"}'
```

The webhook is disabled unless `BILLING_WEBHOOK_SECRET` is set. Treat the secret like any other production credential and rotate it if it leaks.

---

## Verification

```bash
npm test
```

The test suite covers:

1. health, reset and seeded cohort
2. Thabo's complete six-agent recovery:
   - pre-filled demo answers
   - **2/5** diagnostic
   - negative-operations diagnosis
   - three Tutor-checked practice items
   - **4/5 (80%)** mastery pass
   - teacher insight and `complete_pass` teacher status
3. the below-threshold path for Lerato:
   - adapted attempt 2
   - exhausted attempts → `complete`
   - `complete_support` teacher status
4. invalid request handling (missing learner, incomplete diagnostic)

The tests also exercise a mock OpenAI-compatible provider and a complete
six-agent workflow, scoring safeguards, and persistence across separate
processes. Test data uses temporary directories and does not reset the local
demo database. The production client is verified with `npm run build`. A
browser-level check of the Thabo flow and teacher dashboard is described in
the demo script above.

With `DATABASE_URL` set, the classroom suite also covers teacher/student auth,
roster ownership and PIN resets, student session ownership, cross-student
isolation, starting and resuming a classroom cycle, restarting an active cycle,
a full six-agent classroom run persisted against the correct `class_id` and
`student_id`, and the teacher progress endpoints (class stats, per-student
detail, Teacher Insight, and cross-teacher isolation). The pilot-safety suite
adds consent enforcement, class-code rotation, learning-history erasure,
permanent class deletion and the untrusted-origin guard. The teacher-lifecycle
suite covers verification enforcement, single-use tokens, password reset and
session revocation; the class-operations suite covers editing, CSV import,
archive/restore and cross-teacher isolation for those actions; the pilot-plans
suite covers the invite gate, class and student limits, upgrade requests, the
billing webhook, paid-plan activation and trial expiry while existing classes
stay usable. Without a database those tests skip and the demo suite still runs.

`.github/workflows/ci.yml` runs `npm ci`, the full test suite against a
Postgres 16 service, and `npm run build` on every push and pull request.

---

## Design principles

- **Evidence before labels.** Confidence and specific answers are always shown with a diagnosis.
- **Adapt, don't repeat.** A failed mastery check changes the explanation, reduces cognitive load and uses fresh practice questions.
- **The teacher decides.** The Teacher Insight Agent recommends; it does not assign a permanent category or make the final educational decision.
- **No answer leakage.** Practice hints do not reveal the answer; correct answers are withheld from normal client payloads.
- **Accessible by default.** Semantic landmarks, labelled controls, keyboard-focus styles, a skip link, radio-group semantics, live regions for feedback, and responsive layouts.

---

## Known limitations

- The default demo still uses local JSON persistence, which is single-process and intended for a demo, not concurrent production use. The classroom tenancy layer uses Postgres instead.
- Classroom learning sessions are persisted and scoped to the student. The teacher progress view is read-only: it shows the diagnosis, mastery result and Teacher Insight, but there is no teacher override for the mastery threshold, regrouping, or assignment of a new topic.
- Consent is an attestation, not verified guardian consent. There is no audit log of data access or deletion, no automated retention job, and no self-service learner export; those are required before a paid rollout.
- The demo/learner/teacher routes remain unauthenticated by design. Classroom routes (`/api/auth`, `/api/classes`, `/api/student`) require a session and enforce class ownership, but the original demo switcher is still navigation rather than a security boundary.
- One topic (`Integers and introductory algebra`) with a small question bank; adding new gaps requires new lesson and mastery sets.
- Mastery threshold and attempt limit are configuration values; there is no teacher override UI.
- The deterministic demo provider does not call a language model. The OpenAI mode depends on an external model and deliberately falls back on any failure, so output quality varies with the model.
- SSE subscribers are in memory. Reconnecting clients receive a session snapshot, but events are not replayed from a separate durable log.
- No formal accessibility audit or analytics; the UI has been designed for keyboard and screen-reader use but not certified against WCAG.
