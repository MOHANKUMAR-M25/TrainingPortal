// ============================================================
// Google OAuth 2.0 authentication + JWT sessions
// Admin emails come from ADMIN_EMAILS env var, and additional
// admins can be added at runtime by existing admins.
// The primary admin's Google OAuth tokens are stored so the
// Calendar API can read/write her calendar for slot bookings.
// ============================================================

import { google } from "googleapis";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";


dotenv.config();

// Multiple admins supported — comma-separated in ADMIN_EMAILS env var.
// This list is MUTABLE at runtime: existing admins can add new admins
// through the admin API (in production, persist in a database).
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "meenupkc@gmail.com,mohankumarcts25@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Primary admin (calendar owner) — kept for backwards compatibility
export const ADMIN_EMAIL = ADMIN_EMAILS[0];

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

// ---------- Runtime admin management (admin-only actions) ----------
export function addAdminEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const err = new Error("Please provide a valid email address.");
    err.status = 400;
    throw err;
  }
  if (ADMIN_EMAILS.includes(normalized)) {
    const err = new Error("This email is already an admin.");
    err.status = 409;
    throw err;
  }
  ADMIN_EMAILS.push(normalized);
  console.log(`👑 New admin added: ${normalized}. Current admins: ${ADMIN_EMAILS.join(", ")}`);
  return normalized;
}

export function removeAdminEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  if (normalized === ADMIN_EMAIL) {
    const err = new Error("The primary admin (calendar owner) cannot be removed.");
    err.status = 400;
    throw err;
  }
  const index = ADMIN_EMAILS.indexOf(normalized);
  if (index === -1) {
    const err = new Error("This email is not an admin.");
    err.status = 404;
    throw err;
  }
  ADMIN_EMAILS.splice(index, 1);
  console.log(`👋 Admin removed: ${normalized}. Current admins: ${ADMIN_EMAILS.join(", ")}`);
  return normalized;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function isGoogleConfigured() {
  return (
    process.env.GOOGLE_CLIENT_ID &&
    !process.env.GOOGLE_CLIENT_ID.startsWith("YOUR_") &&
    process.env.GOOGLE_CLIENT_SECRET &&
    !process.env.GOOGLE_CLIENT_SECRET.startsWith("YOUR_")
  );
}

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback"
  );
}

// In-memory store of the admin's Google tokens.
// In production, persist these in a database (encrypted).
export const adminTokens = { current: null };

// ---------- JWT session helpers ----------
export function issueSessionToken(user) {
  return jwt.sign(
    {
      email: user.email,
      name: user.name,
      picture: user.picture,
      isAdmin: user.isAdmin,
      isStudent: user.isStudent || false,
      phone: user.phone || ""
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifySessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---------- Express middleware ----------
export function attachUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.user = token ? verifySessionToken(token) : null;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required. Please sign in with Google." });
  }
  // Admin status is re-checked live against the current admin list, so
  // newly added admins gain access and removed admins lose it immediately.
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({
      error: `Access denied. Only admins (${ADMIN_EMAILS.join(", ")}) can edit website content.`
    });
  }
  next();
}
