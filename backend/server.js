// ============================================================
// German Trainer Website — Backend API (Express)
// - Public content endpoints (bio, courses, reviews, videos...)
// - Google OAuth login for admins (whitelisted emails)
// - Student sign-up/login with OTP (email via SMTP + SMS via Twilio)
// - Admin-protected editing endpoints (reviews, videos, images)
// - File uploads (images/videos) from the admin's local device
// - Admin management (existing admins can add new admins)
// - Google Calendar slot listing + 1-on-1 consultation booking
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { siteData } from "./data/siteData.js";
import {
  ADMIN_EMAIL,
  ADMIN_EMAILS,
  isAdminEmail,
  addAdminEmail,
  removeAdminEmail,
  createOAuthClient,
  isGoogleConfigured,
  adminTokens,
  issueSessionToken,
  attachUser,
  requireAdmin,
  requireStudent
} from "./auth.js";
import { getAvailableSlots, bookSlot } from "./calendar.js";
import { upload, UPLOADS_DIR, isVideoFile } from "./upload.js";
import { startSignup, verifySignup, startLogin, verifyLogin } from "./students.js";
import { isEmailConfigured, isSmsConfigured, sendNotificationEmail } from "./otp.js";
import { registerEnhancementRoutes } from "./routes.enhancements.js";
import { registerLearningRoutes } from "./routes.learning.js";
import { seedLearningContent } from "./learning.js";
import { seedAssessmentForCourse } from "./assessments.js";
import { isDbConfigured, upsertStudent, saveContactSubmission } from "./db.js";
import {
  getPublicFlashSale,
  getPublicCoupons,
  resolveOrderContext,
  quoteWithCoupon,
  listCouponsForAdmin,
  hydrateCouponStore,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getFlashSaleForAdmin,
  updateFlashSale
} from "./coupons.js";
import { google } from "googleapis";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors());
app.use(express.json());
app.use(attachUser);

// Serve uploaded files (images/videos) statically
app.use("/uploads", express.static(UPLOADS_DIR));

// In-memory stores (would be a database in production)
const contactMessages = [];
const consultationBookings = [];

// ---------- Health check ----------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "german-trainer-api",
    googleConfigured: isGoogleConfigured(),
    emailOtpConfigured: isEmailConfigured(),
    smsOtpConfigured: isSmsConfigured(),
    adminCalendarConnected: Boolean(adminTokens.current),
    time: new Date().toISOString()
  });
});

// ============================================================
// AUTH — Google OAuth 2.0 (Admins)
// ============================================================

// Step 1: frontend redirects the user here to start Google login
app.get("/api/auth/google", (_req, res) => {
  if (!isGoogleConfigured()) {
    return res
      .status(503)
      .json({ error: "Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to backend/.env" });
  }
  const oauth2 = createOAuthClient();
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      // Calendar scope — needed so the ADMIN's tokens can manage her calendar
      "https://www.googleapis.com/auth/calendar"
    ]
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with a code
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send("Missing authorization code.");

    const oauth2 = createOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Fetch the user's profile
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();

    const email = (profile.email || "").toLowerCase();
    const isAdmin = isAdminEmail(email);

    // If the ADMIN logged in, store her tokens for Calendar API use
    if (isAdmin) {
      adminTokens.current = tokens;
      console.log(`✅ Admin (${email}) connected — Google Calendar is now live.`);
    } else {
      // Record non-admin Google sign-ins as students in the DB
      upsertStudent({ email, name: profile.name, phone: "", auth_provider: "google" }).catch(() => {});
    }

    const sessionToken = issueSessionToken({
      email,
      name: profile.name,
      picture: profile.picture,
      isAdmin
    });

    // Redirect back to the frontend with the session token
    res.redirect(`${FRONTEND_URL}/?token=${sessionToken}`);
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.redirect(`${FRONTEND_URL}/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// Who am I? (frontend session check)
app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not signed in." });
  // Re-evaluate admin status against the live admin list
  const isAdmin = isAdminEmail(req.user.email);
  res.json({ user: { ...req.user, isAdmin }, adminEmail: ADMIN_EMAIL, adminEmails: ADMIN_EMAILS });
});

// ============================================================
// STUDENT AUTH — Sign-up & Login with OTP (Email + SMS)
// ============================================================

// Sign-up step 1: send OTPs to email + phone
app.post("/api/students/signup", async (req, res) => {
  try {
    const result = await startSignup(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Student signup error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Sign-up step 2: verify OTPs → create account → issue session
app.post("/api/students/verify-otp", async (req, res) => {
  try {
    const student = await verifySignup(req.body || {});
    const token = issueSessionToken({
      email: student.email,
      name: student.name,
      phone: student.phone,
      cid: student.cid || null,
      isAdmin: false,
      isStudent: true
    });
    res.json({
      success: true,
      message: student.cid
        ? `Welcome, ${student.name}! Your account is verified. Your Candidate ID is ${student.cid}.`
        : `Welcome, ${student.name}! Your account has been created and verified.`,
      token,
      student
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Login step 1: send OTP to the registered email
app.post("/api/students/login", async (req, res) => {
  try {
    const result = await startLogin(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Login step 2: verify OTP → issue session
app.post("/api/students/login-verify", (req, res) => {
  try {
    const student = verifyLogin(req.body || {});
    const token = issueSessionToken({
      email: student.email,
      name: student.name,
      phone: student.phone,
      isAdmin: false,
      isStudent: true
    });
    res.json({ success: true, message: `Welcome back, ${student.name}!`, token, student });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// PUBLIC content endpoints (anyone can view)
// ============================================================
app.get("/api/trainer", (_req, res) => res.json(siteData.trainer));
app.get("/api/courses", (_req, res) => res.json(siteData.courses));
app.get("/api/consultation", (_req, res) => res.json(siteData.consultation));
app.get("/api/reviews", (_req, res) => res.json(siteData.reviews));
app.get("/api/testimonials", (_req, res) => res.json(siteData.testimonials));
app.get("/api/videos", (_req, res) => res.json(siteData.videos));
app.get("/api/gallery", (_req, res) => res.json(siteData.gallery));

// Full site payload. NOTE: the raw `coupons` array is deliberately
// replaced with the public projection — it contains hidden referral
// codes and redemption counts that must never reach the browser.
app.get("/api/site", (_req, res) => {
  const { coupons: _rawCoupons, flashSale: _rawFlashSale, ...publicSite } = siteData;
  res.json({
    ...publicSite,
    flashSale: getPublicFlashSale(),
    coupons: getPublicCoupons()
  });
});

// ---------- Flash sale + coupons (public) ----------
app.get("/api/flash-sale", (_req, res) => res.json(getPublicFlashSale()));
app.get("/api/coupons", (_req, res) => res.json({ coupons: getPublicCoupons() }));

// Preview a coupon against a real catalogue item.
// This is a QUOTE ONLY — /api/create-order recomputes the same
// numbers server-side, so tampering with this response achieves nothing.
app.post("/api/coupons/validate", (req, res) => {
  const { code, courseId, sessionId } = req.body || {};

  const context = resolveOrderContext({ courseId, sessionId });
  if (!context.ok) {
    return res.status(400).json({ error: context.error });
  }
  if (context.amount < 1) {
    return res.status(400).json({ error: "This item has no payable price set." });
  }

  const quote = quoteWithCoupon({
    code,
    amount: context.amount,
    scope: context.scope,
    courseId: context.courseId
  });

  // A wrong code is a 200 with `valid: false` + a human reason — the
  // frontend renders it inline rather than treating it as a failure.
  res.json({ ...quote, itemName: context.itemName, scope: context.scope });
});

// ---------- Contact form (public) ----------
app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email and message are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  const entry = {
    id: contactMessages.length + 1,
    name,
    email,
    subject: subject || "General Inquiry",
    message,
    receivedAt: new Date().toISOString()
  };
  contactMessages.push(entry);
  console.log("📩 New contact message:", entry);

  // Persist to Supabase (soft-fail)
  saveContactSubmission({
    name,
    email,
    phone: req.body.phone || "",
    subject: entry.subject,
    message,
    status: "submitted",
    source: "contact_form"
  }).catch(() => {});

  // Email the message to all admins
  try {
    await sendNotificationEmail({
      to: ADMIN_EMAILS.join(","),
      subject: `📩 New contact message: ${entry.subject} — from ${name}`,
      text: `New message from the website contact form:\n\nName: ${name}\nEmail: ${email}\nSubject: ${entry.subject}\n\nMessage:\n${message}\n\nReceived: ${entry.receivedAt}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="color:#DD0000;margin-top:0">📩 New Contact Message</h2>
          <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
            <tr><td style="padding:6px 0;width:90px;color:#888">Name</td><td style="padding:6px 0"><b>${name}</b></td></tr>
            <tr><td style="padding:6px 0;color:#888">Email</td><td style="padding:6px 0"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:6px 0;color:#888">Subject</td><td style="padding:6px 0">${entry.subject}</td></tr>
          </table>
          <div style="margin-top:14px;padding:14px;background:#f8f8f8;border-radius:8px;font-size:14px;color:#333;white-space:pre-wrap">${message}</div>
          <p style="margin-top:14px;color:#888;font-size:12px">Reply directly to this email to answer ${name}.</p>
        </div>`
    });
  } catch (err) {
    // Do not fail the user's submission if the notification email fails
    console.error("⚠️ Could not email contact message to admins:", err.message);
  }

  res.status(201).json({
    success: true,
    message: `Thank you, ${name}! Your message has been received. Meenu will reply to ${email} within 24 hours.`
  });
});

// ============================================================
// CALENDAR — slot listing + booking (public can view & book)
// ============================================================

// List available slots from the trainer's Google Calendar
app.get("/api/calendar/slots", async (_req, res) => {
  try {
    const result = await getAvailableSlots();
    res.json(result);
  } catch (err) {
    console.error("Slot fetch error:", err.message);
    res.status(500).json({ error: "Could not fetch calendar availability: " + err.message });
  }
});

// Book a slot — creates an event on the primary admin's calendar
app.post("/api/calendar/book", async (req, res) => {
  try {
    const { start, end, name, email, phone, sessionId, notes } = req.body;

    if (!start || !end || !name || !email) {
      return res.status(400).json({ error: "Slot time, name and email are required." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }

    const session = siteData.consultation.sessions.find((s) => s.id === Number(sessionId));
    const sessionName = session ? `${session.name} (${session.price})` : "Consultation";

    const result = await bookSlot({
      start,
      end,
      studentName: name,
      studentEmail: email,
      studentPhone: phone,
      sessionName,
      notes
    });

    const booking = {
      id: consultationBookings.length + 1,
      name,
      email,
      phone: phone || "",
      session: sessionName,
      start,
      end,
      notes: notes || "",
      calendarLinked: result.calendarLinked,
      eventLink: result.eventLink,
      status: "confirmed",
      bookedAt: new Date().toISOString()
    };
    consultationBookings.push(booking);

    console.log("📅 New consultation booking:", booking);

    // Real-time email notifications (booking confirmation)
    const slotText = `${new Date(start).toLocaleString()} — ${new Date(end).toLocaleTimeString()}`;
    // 1) Notify all admins
    sendNotificationEmail({
      to: ADMIN_EMAILS.join(","),
      subject: `📅 New booking: ${sessionName} — ${name} (${slotText})`,
      text: `New consultation booking:\n\nStudent: ${name}\nEmail: ${email}\nPhone: ${phone || "—"}\nSession: ${sessionName}\nSlot: ${slotText}\nNotes: ${notes || "—"}\n${result.eventLink ? "Calendar event: " + result.eventLink : "(Calendar not linked — demo booking)"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="color:#DD0000;margin-top:0">📅 New Consultation Booking</h2>
          <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
            <tr><td style="padding:6px 0;width:90px;color:#888">Student</td><td style="padding:6px 0"><b>${name}</b></td></tr>
            <tr><td style="padding:6px 0;color:#888">Email</td><td style="padding:6px 0"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:6px 0;color:#888">Phone</td><td style="padding:6px 0">${phone || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Session</td><td style="padding:6px 0">${sessionName}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Slot</td><td style="padding:6px 0"><b>${slotText}</b></td></tr>
            <tr><td style="padding:6px 0;color:#888">Notes</td><td style="padding:6px 0">${notes || "—"}</td></tr>
          </table>
          ${result.eventLink ? `<p style="margin-top:12px"><a href="${result.eventLink}" style="color:#DD0000;font-weight:bold">📆 View calendar event</a></p>` : ""}
        </div>`
    }).catch((err) => console.error("⚠️ Admin booking email failed:", err.message));

    // 2) Confirmation to the student
    sendNotificationEmail({
      to: email,
      subject: `✅ Booking confirmed: ${sessionName} — ${slotText}`,
      text: `Hello ${name},\n\nYour consultation is confirmed!\n\nSession: ${sessionName}\nSlot: ${slotText}\n${result.meetLink ? "Google Meet: " + result.meetLink : ""}\n\nSee you there!\n— Meenu, German Trainer`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="color:#DD0000;margin-top:0">✅ Your Booking is Confirmed!</h2>
          <p style="font-size:14px;color:#333">Hello <b>${name}</b>, your consultation has been booked successfully.</p>
          <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
            <tr><td style="padding:6px 0;width:90px;color:#888">Session</td><td style="padding:6px 0"><b>${sessionName}</b></td></tr>
            <tr><td style="padding:6px 0;color:#888">Slot</td><td style="padding:6px 0"><b>${slotText}</b></td></tr>
          </table>
          ${result.meetLink ? `<p style="margin-top:12px"><a href="${result.meetLink}" style="color:#DD0000;font-weight:bold">🎥 Join with Google Meet</a></p>` : ""}
          <p style="margin-top:14px;color:#888;font-size:12px">See you there! — Meenu, German Trainer</p>
        </div>`
    }).catch((err) => console.error("⚠️ Student booking email failed:", err.message));
    res.status(201).json({ success: true, message: result.message, booking, meetLink: result.meetLink || null });
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ error: "Booking failed: " + err.message });
  }
});

// ============================================================
// ADMIN endpoints — only whitelisted admins (via Google login)
// ============================================================

// --- File upload (images/videos from the admin's local device) ---
app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({
      success: true,
      url,
      type: isVideoFile(req.file.mimetype) ? "video" : "image",
      originalName: req.file.originalname,
      size: req.file.size
    });
  });
});

// --- Admin management (existing admins can add/remove admins) ---
app.get("/api/admin/admins", requireAdmin, (_req, res) => {
  res.json({ admins: ADMIN_EMAILS, primaryAdmin: ADMIN_EMAIL });
});

app.post("/api/admin/admins", requireAdmin, (req, res) => {
  try {
    const email = addAdminEmail(req.body?.email);

    // Real-time email: welcome the new admin
    sendNotificationEmail({
      to: email,
      subject: "👑 You've been made an admin — German Trainer website",
      text: `Hello,\n\nYou have been granted admin access on the German Trainer website by ${req.user.email}.\n\nSign in with your Google account (${email}) on the website to start editing content.\n\n— German Trainer Website`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
          <h2 style="color:#DD0000;margin-top:0">👑 You're now an Admin!</h2>
          <p style="font-size:14px;color:#333">You have been granted admin access on the <b>German Trainer</b> website by <b>${req.user.email}</b>.</p>
          <p style="font-size:14px;color:#333">Sign in with your Google account (<b>${email}</b>) to start editing courses, images, videos and more.</p>
        </div>`
    }).catch((err) => console.error("⚠️ New-admin email failed:", err.message));

    // Real-time email: notify existing admins
    sendNotificationEmail({
      to: ADMIN_EMAILS.filter((e) => e !== email).join(","),
      subject: `👑 Admin added: ${email}`,
      text: `${req.user.email} added a new admin: ${email}\n\nCurrent admins: ${ADMIN_EMAILS.join(", ")}`
    }).catch((err) => console.error("⚠️ Admin-change email failed:", err.message));

    res.status(201).json({
      success: true,
      message: `${email} is now an admin. They can sign in with Google to start editing.`,
      admins: ADMIN_EMAILS
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/admin/admins/:email", requireAdmin, (req, res) => {
  try {
    if ((req.params.email || "").toLowerCase() === req.user.email) {
      return res.status(400).json({ error: "You cannot remove yourself." });
    }
    const email = removeAdminEmail(req.params.email);
    res.json({ success: true, message: `${email} is no longer an admin.`, admins: ADMIN_EMAILS });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- Trainer profile ---
app.put("/api/admin/trainer", requireAdmin, (req, res) => {
  Object.assign(siteData.trainer, req.body);
  res.json({ success: true, trainer: siteData.trainer });
});

// --- Courses ---
app.post("/api/admin/courses", requireAdmin, (req, res) => {
  const course = { id: Date.now(), ...req.body };
  siteData.courses.push(course);
  res.status(201).json({ success: true, course });
});

app.put("/api/admin/courses/:id", requireAdmin, (req, res) => {
  const course = siteData.courses.find((c) => c.id === Number(req.params.id));
  if (!course) return res.status(404).json({ error: "Course not found." });
  Object.assign(course, req.body);
  res.json({ success: true, course });
});

app.delete("/api/admin/courses/:id", requireAdmin, (req, res) => {
  const index = siteData.courses.findIndex((c) => c.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Course not found." });
  const [removed] = siteData.courses.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Student reviews (admin adds in real-time) ---
app.post("/api/admin/reviews", requireAdmin, (req, res) => {
  const { name, country, rating, course, text } = req.body;
  if (!name || !rating || !text) {
    return res.status(400).json({ error: "Name, rating and review text are required." });
  }
  const review = {
    id: Date.now(),
    name,
    country: country || "—",
    rating: Math.min(5, Math.max(1, Number(rating))),
    course: course || "General",
    text
  };
  siteData.reviews.push(review);
  res.status(201).json({ success: true, review });
});

app.delete("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  const index = siteData.reviews.findIndex((r) => r.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Review not found." });
  const [removed] = siteData.reviews.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Testimonials ---
app.post("/api/admin/testimonials", requireAdmin, (req, res) => {
  const { name, role, text, photo } = req.body;
  if (!name || !text) return res.status(400).json({ error: "Name and text are required." });
  const testimonial = { id: Date.now(), name, role: role || "", text, photo: photo || "" };
  siteData.testimonials.push(testimonial);
  res.status(201).json({ success: true, testimonial });
});

// Update an existing testimonial (including its photo)
app.put("/api/admin/testimonials/:id", requireAdmin, (req, res) => {
  const testimonial = siteData.testimonials.find((t) => t.id === Number(req.params.id));
  if (!testimonial) return res.status(404).json({ error: "Testimonial not found." });
  const { name, role, text, photo } = req.body;
  if (name !== undefined) testimonial.name = name;
  if (role !== undefined) testimonial.role = role;
  if (text !== undefined) testimonial.text = text;
  if (photo !== undefined) testimonial.photo = photo;
  res.json({ success: true, testimonial });
});

app.delete("/api/admin/testimonials/:id", requireAdmin, (req, res) => {
  const index = siteData.testimonials.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Testimonial not found." });
  const [removed] = siteData.testimonials.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Videos (admin adds/updates in real-time) ---
// Videos can be either:
//   - YouTube videos (youtubeId provided), or
//   - Uploaded/linked video files (videoUrl provided — from local upload or a direct link)
app.post("/api/admin/videos", requireAdmin, (req, res) => {
  const { title, description, youtubeId, videoUrl, thumbnail } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required." });
  if (!youtubeId && !videoUrl) {
    return res.status(400).json({ error: "Provide either a YouTube ID or a video file/URL." });
  }
  const video = {
    id: Date.now(),
    title,
    description: description || "",
    youtubeId: youtubeId || "",
    videoUrl: videoUrl || "",
    thumbnail: youtubeId
      ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
      : thumbnail || ""
  };
  siteData.videos.push(video);
  res.status(201).json({ success: true, video });
});

// Update an existing video (title, description, YouTube ID or direct video URL)
app.put("/api/admin/videos/:id", requireAdmin, (req, res) => {
  const video = siteData.videos.find((v) => v.id === Number(req.params.id));
  if (!video) return res.status(404).json({ error: "Video not found." });
  const { title, description, youtubeId, videoUrl, thumbnail } = req.body;
  if (title !== undefined) video.title = title;
  if (description !== undefined) video.description = description;
  if (youtubeId !== undefined && youtubeId) {
    video.youtubeId = youtubeId;
    video.videoUrl = "";
    video.thumbnail = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
  }
  if (videoUrl !== undefined && videoUrl) {
    video.videoUrl = videoUrl;
    video.youtubeId = "";
    video.thumbnail = thumbnail || video.thumbnail || "";
  }
  res.json({ success: true, video });
});

app.delete("/api/admin/videos/:id", requireAdmin, (req, res) => {
  const index = siteData.videos.findIndex((v) => v.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Video not found." });
  const [removed] = siteData.videos.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Gallery images (admin adds/updates in real-time) ---
app.post("/api/admin/gallery", requireAdmin, (req, res) => {
  const { title, url } = req.body;
  if (!url) return res.status(400).json({ error: "Image URL is required." });
  const image = { id: Date.now(), title: title || "Training image", url };
  siteData.gallery.push(image);
  res.status(201).json({ success: true, image });
});

// Update an existing gallery image (title and/or URL)
app.put("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const image = siteData.gallery.find((g) => g.id === Number(req.params.id));
  if (!image) return res.status(404).json({ error: "Image not found." });
  const { title, url } = req.body;
  if (title !== undefined) image.title = title;
  if (url !== undefined) {
    if (!url) return res.status(400).json({ error: "Image URL cannot be empty." });
    image.url = url;
  }
  res.json({ success: true, image });
});

// Update the trainer's profile photo
app.put("/api/admin/trainer/photo", requireAdmin, (req, res) => {
  const { photo } = req.body;
  if (!photo) return res.status(400).json({ error: "Photo URL is required." });
  siteData.trainer.photo = photo;
  res.json({ success: true, photo: siteData.trainer.photo });
});

app.delete("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const index = siteData.gallery.findIndex((g) => g.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Image not found." });
  const [removed] = siteData.gallery.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Coupons (admin CRUD) ---
app.get("/api/admin/coupons", requireAdmin, (_req, res) => {
  res.json({ coupons: listCouponsForAdmin() });
});

app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
  try {
    const coupon = await createCoupon(req.body);
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  try {
    // A partial body is allowed, so the panel can toggle just `active`.
    const coupon = await updateCoupon(req.params.code, req.body);
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/admin/coupons/:code", requireAdmin, async (req, res) => {
  try {
    const removed = await deleteCoupon(req.params.code);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- Flash sale banner (admin) ---
app.get("/api/admin/flash-sale", requireAdmin, (_req, res) => {
  res.json({ flashSale: getFlashSaleForAdmin() });
});

app.put("/api/admin/flash-sale", requireAdmin, async (req, res) => {
  try {
    const flashSale = await updateFlashSale(req.body);
    res.json({ success: true, flashSale, public: getPublicFlashSale() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --- Admin dashboards ---
app.get("/api/admin/messages", requireAdmin, (_req, res) => res.json(contactMessages));
app.get("/api/admin/bookings", requireAdmin, (_req, res) => res.json(consultationBookings));

// ============================================================
// ENHANCEMENT ROUTES — tracking, callback, payments, dashboard
// (mounted last so the core routes above take precedence)
// ============================================================
registerEnhancementRoutes(app, { requireAdmin, adminEmails: ADMIN_EMAILS, sendNotificationEmail });

// ============================================================
// LEARNING ROUTES — course modules, progress, assessments, grading
// ============================================================
registerLearningRoutes(app, {
  requireAdmin,
  requireStudent,
  adminEmails: ADMIN_EMAILS,
  sendNotificationEmail
});

// ---------- 404 handler ----------
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// ============================================================
// STARTUP
// Coupons + the flash sale banner are loaded from Supabase into
// memory BEFORE the first request, so no visitor can be quoted a
// price from stale seed data. A failure here is non-fatal: the
// defaults in data/siteData.js are used and the reason is logged.
// ============================================================
const couponStore = await hydrateCouponStore().catch((err) => ({
  source: "seed",
  note: `Coupon hydration failed (${err.message}). Using the defaults from data/siteData.js.`
}));

// Modules and assessments are seeded only into EMPTY tables, so this is safe
// on every boot and never overwrites Meenu's edits.
const learningStore = await seedLearningContent({ seedAssessment: seedAssessmentForCourse }).catch((err) => ({
  source: "seed",
  note: `Learning content seeding failed (${err.message}).`
}));

app.listen(PORT, () => {
  console.log(`🇩🇪 German Trainer API running at http://localhost:${PORT}`);
  console.log(`   Admin accounts: ${ADMIN_EMAILS.join(", ")}`);
  console.log(`   Google OAuth configured: ${isGoogleConfigured() ? "YES" : "NO — add GOOGLE_CLIENT_ID/SECRET to .env"}`);
  console.log(`   Email (SMTP) configured: ${isEmailConfigured() ? "YES — real-time email enabled" : "NO — add SMTP_* to .env"}`);
  console.log(`   SMS (Twilio) configured: ${isSmsConfigured() ? "YES — real-time SMS enabled" : "NO — add TWILIO_* to .env"}`);
  console.log(`   Supabase DB configured: ${isDbConfigured() ? "YES — analytics & payments persisted" : "NO — add SUPABASE_* to .env"}`);

  if (couponStore.source === "supabase") {
    console.log(`   Coupons: ${couponStore.count} loaded from Supabase — edits persist across restarts`);
  } else {
    console.log(`   Coupons: using data/siteData.js defaults`);
    if (couponStore.note) console.log(`     ⚠️ ${couponStore.note}`);
  }

  if (learningStore.source === "supabase") {
    const seeded = [];
    if (learningStore.modules) seeded.push(`${learningStore.modules} modules`);
    if (learningStore.assessments) seeded.push(`${learningStore.assessments} assessments`);
    console.log(
      `   Learning: ready${seeded.length ? ` — seeded ${seeded.join(" + ")}` : " (existing content kept)"}`
    );
  } else {
    console.log(`   Learning: modules read-only, progress tracking OFF`);
    if (learningStore.note) console.log(`     ⚠️ ${learningStore.note}`);
  }
});
