# 🇩🇪 German Trainer Website — Meenu

A polished, full-stack web application for German language trainer **Meenu** (meenupkc@gmail.com), featuring the trainer's bio, course details, contact details, paid one-on-one consultation booking via **Google Calendar**, student reviews, testimonials, videos and an image gallery — with a secure, trainer-only admin panel for real-time content editing.

## Tech Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | React 18 + Vite + Tailwind CSS + Sass (SCSS)                 |
| Backend  | Node.js + Express (REST API)                                 |
| Auth     | Google OAuth 2.0 + JWT sessions                              |
| Calendar | Google Calendar API (freebusy + event creation + Meet links) |

## 🔐 Security Model

- **Anyone** can view the website and book consultation slots.
- **Only** `meenupkc@gmail.com` (signed in via Google) gets the Admin Panel and edit rights:
  - Add student reviews in real-time
  - Add testimonials in real-time
  - Add YouTube videos in real-time
  - Add training images in real-time
  - Update trainer profile / courses (API)
- All `/api/admin/*` endpoints are protected by JWT and verify the Google account email server-side.

## 📅 Google Calendar Booking Flow

1. Meenu signs in once with Google (`Sign in` button) — her OAuth tokens allow the backend to access her calendar.
2. Students see her **live availability** (free slots computed via the Calendar freebusy API, Mon–Sat 9:00–19:00).
3. A student picks a slot, enters name/email/phone, and books.
4. The backend creates a **Google Calendar event** on Meenu's calendar with the student as attendee — the student automatically receives a calendar invite **with a Google Meet link**.

> Until Google credentials are configured, the app runs in **demo mode** (default slots shown, bookings recorded in memory).

## Project Structure

```
Sample/
├── frontend/                     # React + Vite + Tailwind + Sass
│   └── src/
│       ├── App.jsx               # Root (wraps AuthProvider)
│       ├── AuthContext.jsx       # Google OAuth session handling
│       ├── api.js                # API calls + JWT header
│       ├── styles/main.scss      # Sass variables + Tailwind layers
│       └── components/
│           ├── Navbar.jsx        # + Google Sign-in button
│           ├── AdminPanel.jsx    # 🔐 Trainer-only editing panel
│           ├── CalendarBooking.jsx  # 📅 Slot picker + booking form + coupon
│           ├── Consultation.jsx  # Session packages
│           ├── FlashSaleBanner.jsx  # ⚡ Promo strip + live countdown
│           ├── CouponField.jsx   # 🎟 Shared coupon input (Courses + booking)
│           ├── CouponsAdmin.jsx  # 🔐 Coupon + banner management (admin tab)
│           ├── MyLearning.jsx    # 🎓 Student hub: modules + progress
│           ├── AssessmentPlayer.jsx # Written + oral assessment runner
│           ├── OralRecorder.jsx  # 🎤 Mic recording (MediaRecorder)
│           ├── ModulesAdmin.jsx  # 🔐 Module editor
│           ├── AssessmentsAdmin.jsx # 🔐 Assessment + question builder
│           ├── GradingAdmin.jsx  # 🔐 Listen to & score recordings
│           ├── SpokenGerman.jsx  # 🗣 Spoken German landing section
│           └── ... (Hero, About, Courses, Reviews, Testimonials,
│                    Videos, Gallery, Contact, Footer)
└── backend/                      # Node.js + Express REST API
    ├── server.js                 # Routes (public / auth / calendar / admin)
    ├── auth.js                   # Google OAuth + JWT + admin middleware
    ├── calendar.js               # Google Calendar freebusy + event booking
    ├── coupons.js                # 🎟 Coupon validation + server-side pricing
    ├── learning.js               # 📖 Modules, enrollment, progress
    ├── assessments.js            # 📝 Assessments, scoring, grading
    ├── payment.js                # Razorpay order creation + signature verify
    ├── .env                      # ⚙️ Google credentials go here
    └── data/siteData.js          # ✏️ Editable site content
```

## Getting Started

### 1. Backend (port 5000)

```bash
cd backend
npm install
npm start
```

### 2. Frontend (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## ⚙️ Google Cloud Setup (required for live login + calendar)

1. Go to https://console.cloud.google.com/ → create/select a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → External → add `meenupkc@gmail.com` as a test user → add scopes: `email`, `profile`, `.../auth/calendar`.
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID → Web application**:
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:5000/api/auth/google/callback`
5. Copy the **Client ID** and **Client Secret** into `backend/.env`:
   ```env
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxx
   JWT_SECRET=some-long-random-string
   ```
6. Restart the backend. Meenu then clicks **Sign in** on the site — after her first login, her calendar goes live for student bookings.

## API Endpoints

### Public
| Method | Endpoint                 | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/api/site`              | All site content (coupons sanitized) |
| GET    | `/api/calendar/slots`    | Available booking slots (live/demo)  |
| POST   | `/api/calendar/book`     | Book a 1-on-1 slot (creates GCal event) |
| POST   | `/api/contact`           | Contact form                         |
| GET    | `/api/flash-sale`        | Active flash sale banner (auto-hides when expired) |
| GET    | `/api/coupons`           | Publicly advertisable coupons        |
| POST   | `/api/coupons/validate`  | Price preview for a code + `courseId`/`sessionId` |
| GET    | `/api/learning/courses/:id/modules` | Course syllabus (no answers) |

### Student (signed in)
| Method | Endpoint                                | Description                     |
| ------ | --------------------------------------- | ------------------------------- |
| GET    | `/api/learning/me`                      | My courses + progress           |
| GET    | `/api/learning/courses/:id`             | My progress through a course    |
| POST   | `/api/learning/progress`                | Tick / un-tick a module         |
| GET    | `/api/assessments/:courseId/status`     | Unlock state, attempts, best score |
| POST   | `/api/assessments/:courseId/start`      | Start (or resume) an attempt    |
| POST   | `/api/assessments/attempts/:id/audio/:questionId` | Upload one oral answer |
| POST   | `/api/assessments/attempts/:id/submit`  | Submit + auto-score             |
| GET    | `/api/assessments/attempts/:id`         | My result & feedback            |

### Auth
| Method | Endpoint                    | Description                       |
| ------ | --------------------------- | --------------------------------- |
| GET    | `/api/auth/google`          | Start Google OAuth login          |
| GET    | `/api/auth/google/callback` | OAuth redirect (issues JWT)       |
| GET    | `/api/auth/me`              | Current session info              |

### Admin (JWT required, only meenupkc@gmail.com)
| Method       | Endpoint                        | Description                |
| ------------ | ------------------------------- | -------------------------- |
| PUT          | `/api/admin/trainer`            | Update trainer profile     |
| POST/PUT/DEL | `/api/admin/courses[/:id]`      | Manage courses             |
| POST/DEL     | `/api/admin/reviews[/:id]`      | Add/remove student reviews |
| POST/DEL     | `/api/admin/testimonials[/:id]` | Add/remove testimonials    |
| POST/DEL     | `/api/admin/videos[/:id]`       | Add/remove videos          |
| POST/DEL     | `/api/admin/gallery[/:id]`      | Add/remove images          |
| GET/POST/PUT/DEL | `/api/admin/coupons[/:code]` | Manage coupon codes      |
| GET/PUT      | `/api/admin/flash-sale`         | Manage the sale banner     |
| GET/POST     | `/api/admin/courses/:id/modules` | List / add course modules |
| PUT/DEL      | `/api/admin/modules/:id`        | Edit / delete a module     |
| PUT          | `/api/admin/courses/:id/modules/reorder` | Persist module order |
| GET/PUT/DEL  | `/api/admin/courses/:id/assessment` | Manage a course assessment |
| POST         | `/api/admin/courses/:id/assessment/questions` | Add a question |
| PUT/DEL      | `/api/admin/assessment-questions/:id` | Edit / delete a question |
| GET          | `/api/admin/grading/queue`      | Attempts awaiting review   |
| GET/PUT      | `/api/admin/grading/attempts/:id` | Grade an attempt         |
| GET/POST     | `/api/admin/enrollments`        | Look up / grant course access |
| POST         | `/api/admin/enrollments/revoke` | Revoke course access       |
| GET          | `/api/admin/messages`           | View contact submissions   |
| GET          | `/api/admin/bookings`           | View consultation bookings |

## 📖 Modules, Progress & Assessments

Each course has **editable modules** and one **assessment**. A student works
through the modules, ticks each one off, and the assessment unlocks at 100%.

```
pay for a course  →  enrollment granted automatically
                  →  module checklist in "My Learning"
                  →  all modules ticked
                  →  assessment unlocks
```

### Two assessment formats

| Format | Question types | Scoring |
| ------ | -------------- | ------- |
| `written` | multiple choice, multi-select, fill-in-the-blank | **Auto-scored** instantly on submit |
| `oral` | spoken answers recorded with the mic | **Meenu scores each recording** in Admin Panel → 🎤 Grading |

**Spoken German (course 7) ships as an oral assessment** — six speaking tasks.
Each gives the student thinking time, then records their answer (with a length
cap), lets them listen back and re-record, and uploads it. Meenu gets an email,
plays each recording in the Grading tab, scores it out of the question's points
and adds per-answer feedback. Submitting the grade emails the student their
result.

Fill-in-the-blank matching ignores case and folds umlauts, so `HEISSE`, `heiße`
and `heisse` all match one accepted answer.

### Where Meenu edits this

| Admin Panel tab | What it does |
| --------------- | ------------ |
| 📖 Modules | Add / edit / reorder / delete a course's modules |
| 📝 Assessments | Assessment settings + question builder (with answer keys) |
| 🎤 Grading | Queue of submitted recordings to listen to and score |

### Security model

- **Answers never reach the browser.** Student-facing payloads are stripped of
  `correctOptions` / `acceptedAnswers`; scoring happens server-side. They are
  revealed only after an attempt is graded.
- **The unlock gate is re-checked server-side** when an attempt starts, so the
  UI cannot be used to skip ahead.
- **Enrollment comes from the stored payment row**, not a client-supplied course
  id — a student cannot pay for one course and claim another.
- Students can only read and submit **their own** attempts.

Seed modules for all 7 courses plus the two assessments live in
`backend/data/siteData.js` (`moduleSeeds`, `assessmentSeeds`) and are written to
an **empty** database on first boot. After that the database is authoritative.
Recordings are stored in `backend/uploads/` and served from `/uploads/…`.

> Progress tracking and assessments need Supabase. Without it the module list
> still renders as a read-only syllabus, and the assessment routes return `503`.

## 🎟 Flash Sales & Coupons

Meenu manages these from the **Admin Panel → 🎟 Coupons & Sale** tab (sign in with
Google): edit the banner headline/countdown/advertised code, and create, edit,
switch off or delete coupon codes — changes appear on the site immediately.

### Storage

Coupons and the banner are **stored in Supabase** (`coupons` + `flash_sale` tables),
so admin edits survive a server restart.

> ⚠️ **Run `backend/db/schema.sql`** in the Supabase SQL editor before using the
> Coupons tab. Until you do, the API logs a warning at startup, serves the defaults
> from `data/siteData.js`, and returns a `503` telling you to run the migration if
> you try to save — it will not silently accept an edit that would be lost.

How it works:
- At startup `hydrateCouponStore()` loads both tables into memory. Reads stay
  synchronous, which matters because `quoteWithCoupon()` runs inside the Razorpay
  order path.
- Every admin write goes to Supabase **and** the in-memory copy. If the database
  rejects the write, the API returns an error rather than reporting success.
- On a **fresh/empty** database the `coupons` + `flashSale` values in
  `data/siteData.js` are seeded automatically, so a new deployment starts with the
  shipped defaults. After that the database is the source of truth.
- With **no** `SUPABASE_*` configured everything still works from
  `data/siteData.js` — edits just reset on restart, as with the other content here.

The seed/default content lives in `backend/data/siteData.js` (`flashSale` + `coupons`).

```js
{
  code: "GERMAN25",
  type: "percent",        // "percent" | "flat"
  value: 25,              // percent (0–100) or flat rupees off
  appliesTo: "courses",   // "all" | "courses" | "consultation"
  courseIds: [],          // whitelist of course ids ([] = any course)
  minAmount: 0,           // minimum order value in ₹
  maxDiscount: 5000,      // rupee cap on a percent discount (null = uncapped)
  expiresAt: "2026-09-30T23:59:59+05:30",
  usageLimit: null,       // max redemptions (null = unlimited)
  active: true,
  hidden: false           // true = never advertised, only works if typed
}
```

**Pricing is server-authoritative.** The browser sends *what* is being bought
(`courseId` or `sessionId`) plus the typed code — never a price. `/api/create-order`
reads the base price from `siteData` and re-validates the coupon in
`backend/coupons.js` before creating the Razorpay order, so a tampered request
cannot lower the amount charged. `POST /api/coupons/validate` exists only to render
the preview in the UI.

Notes:
- The banner and any expired coupon hide themselves automatically once `endsAt` /
  `expiresAt` passes — no admin edit needed.
- `hidden: true` codes are stripped from `/api/site` and `/api/coupons`, so private
  referral codes are never exposed to the browser.
- Discounts are recorded on the `payments` table (`base_amount`, `discount`,
  `coupon_code`, `item_name`) — the same `schema.sql` run adds these columns to an
  existing database.
- `used_count` is persisted only after a payment signature verifies, so it counts
  real redemptions.

## ✏️ Editing the Website in Future

1. **Real-time (recommended)** — Meenu signs in with Google → the **Admin Panel** appears at the top of the site → add reviews, testimonials, videos and images instantly, and run flash sales / coupon codes from the **🎟 Coupons & Sale** tab.
2. **Content file** — edit `backend/data/siteData.js` and restart the backend.
3. **Styling** — tweak `frontend/tailwind.config.js` and Sass variables in `frontend/src/styles/main.scss`.
4. **New sections** — add a component in `frontend/src/components/` + endpoint in `backend/server.js`.
