// ============================================================
// German Trainer Website — Backend API (Express)
// - Public content endpoints (bio, courses, reviews, videos...)
// - Google OAuth login: ONLY meenupkc@gmail.com becomes admin
// - Admin-protected editing endpoints (reviews, videos, images)
// - Google Calendar slot listing + 1-on-1 consultation booking
// ============================================================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { siteData } from "./data/siteData.js";
import {
  ADMIN_EMAIL,
  createOAuthClient,
  isGoogleConfigured,
  adminTokens,
  issueSessionToken,
  attachUser,
  requireAdmin
} from "./auth.js";
import { getAvailableSlots, bookSlot } from "./calendar.js";
import { google } from "googleapis";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors());
app.use(express.json());
app.use(attachUser);

// In-memory stores (would be a database in production)
const contactMessages = [];
const consultationBookings = [];

// ---------- Health check ----------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "german-trainer-api",
    googleConfigured: isGoogleConfigured(),
    adminCalendarConnected: Boolean(adminTokens.current),
    time: new Date().toISOString()
  });
});

// ============================================================
// AUTH — Google OAuth 2.0
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
    const isAdmin = email === ADMIN_EMAIL;

    // If the ADMIN logged in, store her tokens for Calendar API use
    if (isAdmin) {
      adminTokens.current = tokens;
      console.log(`✅ Admin (${email}) connected — Google Calendar is now live.`);
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
  res.json({ user: req.user, adminEmail: ADMIN_EMAIL });
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
app.get("/api/site", (_req, res) => res.json(siteData));

// ---------- Contact form (public) ----------
app.post("/api/contact", (req, res) => {
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
  res.status(201).json({
    success: true,
    message: `Danke, ${name}! Your message has been received. Meenu will reply to ${email} within 24 hours.`
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

// Book a slot — creates an event on meenupkc@gmail.com's calendar
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
    res.status(201).json({ success: true, message: result.message, booking, meetLink: result.meetLink || null });
  } catch (err) {
    console.error("Booking error:", err.message);
    res.status(500).json({ error: "Booking failed: " + err.message });
  }
});

// ============================================================
// ADMIN endpoints — ONLY meenupkc@gmail.com (via Google login)
// ============================================================

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

app.delete("/api/admin/testimonials/:id", requireAdmin, (req, res) => {
  const index = siteData.testimonials.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Testimonial not found." });
  const [removed] = siteData.testimonials.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Videos (admin adds in real-time) ---
app.post("/api/admin/videos", requireAdmin, (req, res) => {
  const { title, description, youtubeId } = req.body;
  if (!title || !youtubeId) return res.status(400).json({ error: "Title and YouTube ID are required." });
  const video = {
    id: Date.now(),
    title,
    description: description || "",
    youtubeId,
    thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
  };
  siteData.videos.push(video);
  res.status(201).json({ success: true, video });
});

app.delete("/api/admin/videos/:id", requireAdmin, (req, res) => {
  const index = siteData.videos.findIndex((v) => v.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Video not found." });
  const [removed] = siteData.videos.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Gallery images (admin adds in real-time) ---
app.post("/api/admin/gallery", requireAdmin, (req, res) => {
  const { title, url } = req.body;
  if (!url) return res.status(400).json({ error: "Image URL is required." });
  const image = { id: Date.now(), title: title || "Training image", url };
  siteData.gallery.push(image);
  res.status(201).json({ success: true, image });
});

app.delete("/api/admin/gallery/:id", requireAdmin, (req, res) => {
  const index = siteData.gallery.findIndex((g) => g.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Image not found." });
  const [removed] = siteData.gallery.splice(index, 1);
  res.json({ success: true, removed });
});

// --- Admin dashboards ---
app.get("/api/admin/messages", requireAdmin, (_req, res) => res.json(contactMessages));
app.get("/api/admin/bookings", requireAdmin, (_req, res) => res.json(consultationBookings));

// ---------- 404 handler ----------
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

app.listen(PORT, () => {
  console.log(`🇩🇪 German Trainer API running at http://localhost:${PORT}`);
  console.log(`   Admin account: ${ADMIN_EMAIL}`);
  console.log(`   Google OAuth configured: ${isGoogleConfigured() ? "YES" : "NO (demo mode — add credentials to .env)"}`);
});
