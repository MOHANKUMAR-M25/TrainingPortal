// ============================================================
// Google OAuth 2.0 authentication + JWT sessions
// Only ADMIN_EMAIL (meenupkc@gmail.com) receives admin rights.
// The admin's Google OAuth tokens are stored so the Calendar
// API can read/write her calendar for slot bookings.
// ============================================================

import { google } from "googleapis";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";


dotenv.config();

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "meenupkc@gmail.com").toLowerCase();
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
    { email: user.email, name: user.name, picture: user.picture, isAdmin: user.isAdmin },
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
  if (!req.user.isAdmin || req.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({
      error: `Access denied. Only the trainer (${ADMIN_EMAIL}) can edit website content.`
    });
  }
  next();
}
