# CampusOS

School management and learning platform for Nigerian primary and secondary schools.

**Tagline:** One school. One connected platform.

This repository is a working product, built in milestones. **Milestones 1 and 2 have application code and migrations; their database workflows still require deployment verification. Milestone 3 is in progress.** Later modules remain placeholders until their database workflows are built.

## Current architecture

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, React Router, TanStack Query |
| Auth & data | Supabase Auth + PostgreSQL + Row Level Security |
| Tenancy | Every school-owned row has `school_id`. Access is membership + role, not a client-supplied school id. |
| UI | Custom accessible component kit (tokens match the product palette) |

Demo tenant: **Cedarfield Academy** (fictional). Do not put real children’s data in this environment.

## Milestone 1 — what works

- Project setup, design tokens, layout (sidebar, mobile nav, breadcrumbs, toasts)
- Sign in / register
- School onboarding via `complete_school_onboarding` (owner membership, Main Campus, settings, audit)
- Eight roles, including multiple roles per user per school
- Role-specific dashboards (real membership/school data; later metrics stay empty until those modules exist)
- Users & roles assignment for people who already have accounts
- School profile + campus management
- RLS on identity tables
- Seed edge function for Cedarfield demo users

## Other milestone modules

Attendance, assessments, results, and timetable are being implemented in Milestone 3. Parent/student portals, digital classroom, fees, external notification delivery, and AI remain outside this milestone.

Frontend nav hiding is **not** the security boundary. Routes are role-gated; database RLS is the source of truth.

## Milestone 3 — academic workflows (in progress)

Migration `20261119170000_0006_milestone3_academics.sql` adds academic terms (the earlier schema had sessions but no terms), student and staff attendance, configurable assessment components and grading bands, result workflow/history, report-card comments/components, in-app attendance notices, school days/holidays, periods, classrooms, and timetable entries. It reuses the existing students, sections, assignments, sessions, memberships, and audit log tables.

The application includes daily attendance with unmarked states, class/session/campus/term/date filters, batch save, authorized backdating, teacher class checks, linked-family attendance and notices, and a basic staff attendance register. Assessment pages support term/type/configuration, score drafts and submission/review/approval; results compute weighted scores only from complete approved components, support configured grade bands and staged publication, and provide printable report-card views. Timetable configuration supports school days, holidays, periods, rooms, lesson entries, and class/teacher/room conflict checks in the database.

The migration has **not** been applied or validated on a Supabase instance. Milestone 3 is not complete until it is deployed and the RLS/workflow acceptance checks pass. No fictional student/teacher/score demo records are seeded; do not use real children's personal data.

## Milestone 2 — school operations

Migration `20261117150000_0005_school_operations.sql` extends the existing schema with academic sessions, configurable grade levels, classes and sections, departments, guardian relationships, student records, admissions, teacher assignments, enrolments, and transfer history. Existing identity, school membership, staff, and audit tables are extended/reused rather than recreated.

The application now includes:

- Student registration with generated school-scoped IDs, multiple guardians, private photos, school-scoped search/filter/sort/pagination, CSV export, profile editing, restricted medical details, and audit history.
- Guardian directory with existing-record linking, child lists, primary/emergency flags, editing, and permission-checked unlinking.
- Staff directory with employee records, departments, employment status, existing-user linking, teacher-role assignment, and class/subject assignments.
- Teacher dashboard with classes and subjects returned by the teacher-assignment policies; admin dashboard metrics use the Milestone 2 tables.
- Configurable academic sessions and grade levels, class sections, campuses, subjects, and class-subject mappings.
- Admission submission/review/acceptance workflows. Acceptance creates the student, guardian relationship, and first enrolment atomically; retries return the already-created student.
- Enrolment creation, class/campus transfers, withdrawals, and class promotion while retaining prior enrolment history.

RLS policies scope records to school membership, limit parent student visibility to explicitly linked guardians, limit teacher student/class access to assigned sections, and keep medical details manager-only. Student creation, admission acceptance, review decisions, and enrolment transfers use server-validated database functions. Student and admission files use a private `school-documents` bucket.

The student profile's documents, attendance, results, and fees tabs intentionally show empty states until those modules have real records. Applications are currently entered by school administrators; a public applicant portal is not included. Guardian user-account linking is database-validated but does not yet have an account-linking workflow in the UI; admission-document viewing and staff photographs are also outstanding.

After applying the migrations, create an academic session in **Classes & Subjects**, then terms and classes/sections before setting up assessments, results, or timetables. Default Nursery/Primary/JSS/SS levels are seeded per school and can be extended.

## Setup

1. Copy `.env.example` to `.env` and add your Supabase URL and **anon** key.
2. Apply migrations in `supabase/migrations/` to the project (Supabase CLI or dashboard).
3. Deploy `supabase/functions/seed-demo-users` if you want the Cedarfield accounts.
4. Invoke the seed function once (authenticated with a service role from the dashboard/CLI, not from the browser).
5. Install and run:

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run lint
npm run build
```

## Demo logins (fictional)

Password for all: `cedarfield2026`

| Role | Email |
| --- | --- |
| Platform super admin | platform@cedarfield.edu.ng |
| School owner | owner@cedarfield.edu.ng |
| School administrator | admin@cedarfield.edu.ng |
| Academic administrator | academic@cedarfield.edu.ng |
| Bursar | bursar@cedarfield.edu.ng |
| Teacher | teacher@cedarfield.edu.ng |
| Parent | parent@cedarfield.edu.ng |
| Student | student@cedarfield.edu.ng |

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public anon key (RLS still applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions / server only | Admin seed. Never expose to Vite. |

AI and SMS/WhatsApp providers are **not** wired in Milestone 1. When they are added they will be server-side only.

## Testing

Milestone 1 does not yet include an automated RLS suite (planned for Milestone 7). Until then:

1. Register a new school and confirm you land as owner.
2. Sign in as each Cedarfield role and confirm the dashboard and sidebar match that role.
3. As a teacher, open `/users` or `/settings` and confirm redirect to dashboard.
4. Create a second school as another user and confirm you cannot see Cedarfield rows.

Milestone 2 smoke checks (after applying the new migration and creating a session/class setup):

1. Register a student with two guardians; confirm a generated ID and both links.
2. Register another student with the same guardian details; confirm the guardian is reused.
3. Create a staff profile, assign its linked account the teacher role, and assign a class/subject.
4. Submit and review an application, then accept it into the intended class/session; retry acceptance and confirm only one student exists.
5. Create an enrolment, promote/transfer the student, and confirm the earlier enrolment remains in history.
6. Sign in as a teacher, parent, and a user from another school; verify assigned-class, linked-child, and tenant boundaries.
7. Review the audit history for student, guardian, staff, admission, and enrolment actions.

Milestone 3 application checks run locally with `npm run typecheck`, `npm run lint`, and `npm run build`. Database tests remain outstanding until the migration is applied: verify attendance duplicate handling/backdating/holiday rules and linked-parent visibility; score range, missing-score and workflow rules; result weighting/publication/correction history; and class, teacher, and room timetable conflicts under concurrent requests.

## Deployment

- Frontend: Vite build on Vercel (set the `VITE_` env vars).
- Database / auth / storage / edge functions: Supabase.

## Implemented vs outstanding

See the product specification in the project brief. **Implemented in code:** Milestone 1 identity and onboarding; Milestone 2 school operations; and the first Milestone 3 attendance, assessment, results, and timetable workflows. **Outstanding:** apply migrations in order to the authorized Supabase project; validate all database policies and workflows; add fictional demo data, student self-account linking, term-by-term attendance summaries, full report-card attendance summaries and PDF export, and broader performance dashboards; then fix any deployment-specific issues. Do not begin Milestone 4 until Milestone 3 acceptance checks pass.
