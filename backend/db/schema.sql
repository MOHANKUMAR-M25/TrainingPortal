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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_visitors_visited_at on visitors(visited_at desc);
create index if not exists idx_contact_created_at on contact_submissions(created_at desc);
create index if not exists idx_bookings_created_at on bookings(created_at desc);
create index if not exists idx_payments_created_at on payments(created_at desc);
create index if not exists idx_form_activity_created_at on form_activity(created_at desc);
