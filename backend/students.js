// ============================================================
// Student accounts + OTP sign-up flow (in-memory store).
// Flow:
//   1. POST /api/students/signup        → validates details, sends
//      OTPs to email (SMTP) and phone (Twilio SMS).
//   2. POST /api/students/verify-otp    → verifies both codes,
//      creates the account, returns a JWT session token.
//   3. POST /api/students/login         → existing student login,
//      sends an OTP to email for passwordless sign-in.
//   4. POST /api/students/login-verify  → verifies login OTP.
// In production, persist students in a database.
// ============================================================

import { generateOtp, sendEmailOtp, sendSmsOtp, sendNotificationEmail } from "./otp.js";

// email → { name, email, phone, createdAt }
export const students = new Map();

// email → { emailOtp, phoneOtp, name, phone, expiresAt, attempts }
const pendingSignups = new Map();

// email → { otp, expiresAt, attempts }
const pendingLogins = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");
const isValidPhone = (p) => /^\+?[0-9\s-]{10,15}$/.test(p || "");

// ---------- Sign-up: step 1 — request OTPs ----------
export async function startSignup({ name, email, phone }) {
  email = (email || "").trim().toLowerCase();
  phone = (phone || "").replace(/[\s-]/g, "");

  if (!name || !name.trim()) throw httpError(400, "Name is required.");
  if (!isValidEmail(email)) throw httpError(400, "Please provide a valid email address.");
  if (!isValidPhone(phone)) throw httpError(400, "Please provide a valid phone number (with country code, e.g. +919876543210).");
  if (students.has(email)) throw httpError(409, "An account with this email already exists. Please log in instead.");

  const emailOtp = generateOtp();
  const phoneOtp = generateOtp();

  // Real-time delivery on both channels
  await sendEmailOtp(email, emailOtp);

  let smsFailed = false;
  let smsError = "";
  try {
    await sendSmsOtp(phone, phoneOtp);
  } catch (err) {
    // Twilio trial accounts can only SMS verified numbers — don't hard-fail sign-up,
    // but surface the real error to the user.
    console.warn(`⚠️ SMS OTP failed for ${phone}: ${err.message}`);
    smsFailed = true;
    smsError = err.message;
  }

  pendingSignups.set(email, {
    emailOtp,
    phoneOtp,
    name: name.trim(),
    phone,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    smsFailed
  });

  return {
    email,
    phone,
    emailSent: true,
    smsSent: !smsFailed,
    smsFailed,
    message: !smsFailed
      ? `Verification codes sent to ${email} and ${phone}.`
      : `Verification code sent to ${email}. (SMS could not be delivered: ${smsError})`
  };
}

// ---------- Sign-up: step 2 — verify OTPs & create account ----------
export function verifySignup({ email, emailOtp, phoneOtp }) {
  email = (email || "").trim().toLowerCase();
  const pending = pendingSignups.get(email);

  if (!pending) throw httpError(400, "No pending sign-up found for this email. Please sign up again.");
  if (Date.now() > pending.expiresAt) {
    pendingSignups.delete(email);
    throw httpError(400, "Your codes have expired. Please sign up again to receive new codes.");
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    pendingSignups.delete(email);
    throw httpError(429, "Too many wrong attempts. Please sign up again.");
  }

  pending.attempts += 1;

  if ((emailOtp || "").trim() !== pending.emailOtp) {
    throw httpError(400, "Incorrect email code. Please check your inbox and try again.");
  }
  // Only require the phone OTP if the SMS was actually deliverable
  if (!pending.smsFailed && (phoneOtp || "").trim() !== pending.phoneOtp) {
    throw httpError(400, "Incorrect phone code. Please check your SMS and try again.");
  }

  const student = {
    name: pending.name,
    email,
    phone: pending.phone,
    createdAt: new Date().toISOString()
  };
  students.set(email, student);
  pendingSignups.delete(email);

  // Real-time welcome email to the new student (fire-and-forget)
  sendNotificationEmail({
    to: email,
    subject: "🎉 Welcome to German Trainer — account created!",
    text: `Hello ${student.name},\n\nYour account has been created and verified successfully.\n\nYou can now log in anytime with your email (${email}) using a one-time code, browse courses, and book 1-on-1 consultation slots.\n\nWelcome aboard!\n— Meenu, German Trainer`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#DD0000;margin-top:0">🎉 Welcome, ${student.name}!</h2>
        <p style="font-size:14px;color:#333">Your account has been created and verified successfully.</p>
        <p style="font-size:14px;color:#333">You can now log in anytime with your email (<b>${email}</b>) using a one-time code, browse courses, and book 1-on-1 consultation slots.</p>
        <p style="margin-top:14px;color:#888;font-size:12px">Welcome aboard! — Meenu, German Trainer</p>
      </div>`
  }).catch((err) => console.error("⚠️ Welcome email failed:", err.message));

  return student;
}

// ---------- Login: step 1 — request OTP ----------
export async function startLogin({ email }) {
  email = (email || "").trim().toLowerCase();
  if (!isValidEmail(email)) throw httpError(400, "Please provide a valid email address.");

  const student = students.get(email);
  if (!student) throw httpError(404, "No account found with this email. Please sign up first.");

  const otp = generateOtp();
  await sendEmailOtp(email, otp);
  pendingLogins.set(email, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

  return { email, message: `Login code sent to ${email}.` };
}

// ---------- Login: step 2 — verify OTP ----------
export function verifyLogin({ email, otp }) {
  email = (email || "").trim().toLowerCase();
  const pending = pendingLogins.get(email);

  if (!pending) throw httpError(400, "No pending login found. Please request a new code.");
  if (Date.now() > pending.expiresAt) {
    pendingLogins.delete(email);
    throw httpError(400, "Your code has expired. Please request a new one.");
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    pendingLogins.delete(email);
    throw httpError(429, "Too many wrong attempts. Please request a new code.");
  }

  pending.attempts += 1;
  if ((otp || "").trim() !== pending.otp) {
    throw httpError(400, "Incorrect code. Please try again.");
  }

  pendingLogins.delete(email);
  return students.get(email);
}

// ---------- helper ----------
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
