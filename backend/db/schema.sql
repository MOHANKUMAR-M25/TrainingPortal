-- ============================================================
-- German Trainer — Supabase schema
-- Run this in Supabase → SQL Editor (New query → paste → Run).
-- It creates all tables used by the backend for analytics,
-- bookings and payments. Safe to re-run (IF NOT EXISTS).
-- ============================================================

-- Students / registered users
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  cid text unique,                         -- Candidate ID (CID-YYYY-XXXXXX), unique & permanent
  email text unique not null,
  name text,
  phone text,
  auth_provider text default 'otp',       -- otp | google | guest
  created_at timestamptz default now()
);

-- If the students table already existed, add the CID column:
alter table students add column if not exists cid text;
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'students_cid_key') then
    begin
      alter table students add constraint students_cid_key unique (cid);
    exception when others then null;
    end;
  end if;
end $$;

-- Anonymous visitor / page-view tracking ("who just visited?")
create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  page text,
  referrer text,
  user_agent text,
  ip text,
  email text,                              -- filled if visitor is signed in
  visited_at timestamptz default now()
);

-- Contact form + Request-a-callback submissions
-- status: submitted | partial | callback_requested
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  subject text,
  message text,
  status text default 'submitted',
  source text default 'contact_form',      -- contact_form | callback | booking
  created_at timestamptz default now()
);

-- Form activity — who started a form but didn't finish (half-filled)
-- event: form_start | form_abandon | form_submit
create table if not exists form_activity (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  form_name text,                           -- contact | booking | callback | signup
  event text,
  filled_fields jsonb,                      -- snapshot of what was typed
  email text,
  created_at timestamptz default now()
);

-- Consultation bookings
-- status: attempted | booked | abandoned | paid | payment_failed | cancelled
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  session_id int,
  session_name text,
  amount numeric,                            -- INR
  slot_start timestamptz,
  slot_end timestamptz,
  notes text,
  status text default 'attempted',
  calendar_event_id text,
  calendar_event_link text,
  meet_link text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Razorpay payments
-- status: created | authorized | captured | failed | refunded
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount numeric,                            -- INR (rupees)
  currency text default 'INR',
  status text default 'created',
  email text,
  name text,
  phone text,
  error_reason text,
  base_amount numeric,                       -- INR before any discount
  discount numeric default 0,                -- INR taken off by the coupon
  coupon_code text,                          -- the code that was applied (null = none)
  item_name text,                            -- course/session the payment was for
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Coupon columns for databases created before flash sales existed:
alter table payments add column if not exists base_amount numeric;
alter table payments add column if not exists discount numeric default 0;
alter table payments add column if not exists coupon_code text;
alter table payments add column if not exists item_name text;

-- Coupon codes (source of truth; the API caches these in memory)
-- type: percent | flat   ·   applies_to: all | courses | consultation
create table if not exists coupons (
  code text primary key,                     -- always stored UPPERCASE
  type text not null default 'percent',
  value numeric not null,                    -- percent (0–100) or flat ₹ off
  description text default '',
  applies_to text default 'all',
  course_ids jsonb default '[]'::jsonb,      -- [] = every course
  min_amount numeric default 0,              -- minimum order value in ₹
  max_discount numeric,                      -- null = uncapped (percent only)
  expires_at timestamptz,                    -- null = never expires
  usage_limit int,                           -- null = unlimited
  used_count int default 0,
  active boolean default true,
  hidden boolean default false,              -- true = never advertised publicly
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Flash sale banner — a single row, pinned to id = 1
create table if not exists flash_sale (
  id int primary key default 1,
  active boolean default false,
  headline text default '',
  subtext text default '',
  code text,                                 -- coupon advertised on the banner
  ends_at timestamptz,                       -- countdown target (null = none)
  cta_label text default '',
  cta_href text default '#courses',
  updated_at timestamptz default now(),
  constraint flash_sale_singleton check (id = 1)
);

-- ============================================================
-- LEARNING & ASSESSMENT
-- `course_id` refers to a course id in backend/data/siteData.js
-- (courses are content, not a table), so it is a plain int with
-- no foreign key.
-- ============================================================

-- Editable modules inside each course
create table if not exists course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id int not null,
  position int default 0,                    -- display order
  title text not null,
  summary text default '',
  content text default '',                   -- lesson notes / what to study
  duration_label text default '',            -- e.g. "45 min"
  resource_url text default '',              -- optional PDF / notes link
  video_url text default '',                 -- lesson video (YouTube link or uploaded file)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_modules_course on course_modules(course_id, position);

-- Video column for databases created before module videos existed:
alter table course_modules add column if not exists video_url text default '';

-- A student's access to a course. Created automatically when a
-- Razorpay payment signature verifies (see /api/verify-payment).
create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text default '',
  course_id int not null,
  course_title text default '',
  razorpay_order_id text,                    -- provenance of the access grant
  source text default 'payment',             -- payment | manual (admin granted)
  status text default 'active',              -- active | revoked
  enrolled_at timestamptz default now(),
  unique (email, course_id)                  -- re-purchase must not duplicate
);
create index if not exists idx_enrollments_email on enrollments(email);

-- Per-student, per-module completion ticks
create table if not exists module_progress (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  course_id int not null,
  module_id uuid not null references course_modules(id) on delete cascade,
  completed_at timestamptz default now(),
  unique (email, module_id)                  -- ticking twice is idempotent
);
create index if not exists idx_progress_email_course on module_progress(email, course_id);

-- One assessment per course
-- format: written (auto-scored) | oral (mic answers, trainer-reviewed)
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  course_id int not null unique,
  title text not null default 'Course Assessment',
  description text default '',
  format text not null default 'written',
  pass_percent numeric default 80,
  time_limit_minutes int,                    -- null = untimed
  max_attempts int,                          -- null = unlimited
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- type: mcq (one answer) | multi (choose all) | text (fill in the blank) | oral
create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  position int default 0,
  type text not null default 'mcq',
  prompt text not null,
  helper_text text default '',               -- shown under the prompt
  options jsonb default '[]'::jsonb,         -- ["der","die","das"] for mcq/multi
  correct_options jsonb default '[]'::jsonb, -- [0] / [0,2] indices into options
  accepted_answers jsonb default '[]'::jsonb,-- ["ü","ue"] for text questions
  points numeric default 1,
  prep_seconds int default 15,               -- oral: thinking time
  max_seconds int default 90,                -- oral: recording cap
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_questions_assessment on assessment_questions(assessment_id, position);

-- status: in_progress | submitted | graded
create table if not exists assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  course_id int not null,
  email text not null,
  name text default '',
  status text default 'in_progress',
  auto_points numeric default 0,             -- from auto-scored questions
  trainer_points numeric,                    -- filled in when graded
  max_points numeric default 0,
  percent numeric,
  passed boolean,
  trainer_feedback text default '',
  graded_by text,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  graded_at timestamptz
);
create index if not exists idx_attempts_email on assessment_attempts(email, course_id);
create index if not exists idx_attempts_status on assessment_attempts(status, submitted_at desc);

create table if not exists assessment_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  question_id uuid not null references assessment_questions(id) on delete cascade,
  response jsonb,                            -- selected indices or typed text
  audio_url text,                            -- oral answers
  auto_correct boolean,                      -- null for questions needing review
  awarded_points numeric default 0,
  trainer_points numeric,                    -- trainer's score for oral answers
  trainer_note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (attempt_id, question_id)           -- one answer per question
);

-- Which course a payment was for, so enrollment is granted from the
-- server-side payment record rather than a client-supplied id:
alter table payments add column if not exists course_id int;

-- Pass mark policy: every course requires 80% to pass.
-- Migrates existing assessments created with the old 60% default.
alter table assessments alter column pass_percent set default 80;
update assessments set pass_percent = 80 where pass_percent < 80;

-- Helpful indexes
create index if not exists idx_visitors_visited_at on visitors(visited_at desc);
create index if not exists idx_contact_created_at on contact_submissions(created_at desc);
create index if not exists idx_bookings_created_at on bookings(created_at desc);
create index if not exists idx_payments_created_at on payments(created_at desc);
create index if not exists idx_form_activity_created_at on form_activity(created_at desc);
create index if not exists idx_coupons_active on coupons(active, expires_at);
