// ============================================================
// OTP service — Email (Nodemailer/SMTP) + SMS (Twilio)
// Used for student sign-up verification and site notifications.
// All channels are REAL-TIME: if a channel is not configured,
// an explicit error is thrown (no demo fallbacks).
// ============================================================

import nodemailer from "nodemailer";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

// ---------- Config detection ----------
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isSmsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

// ---------- Transports ----------
let mailTransport = null;
function getMailTransport() {
  if (!mailTransport && isEmailConfigured()) {
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return mailTransport;
}

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ---------- OTP helpers ----------
export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Send OTP via email (real-time). Throws if email is not configured.
export async function sendEmailOtp(email, otp) {
  if (!isEmailConfigured()) {
    throw new Error("Email service is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in backend/.env");
  }
  const transport = getMailTransport();
  await transport.sendMail({
    from: `"German Trainer — Meenu" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your verification code",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#DD0000;margin-top:0">German Trainer — Verification Code</h2>
        <p>Use the code below to verify your account. It expires in <b>10 minutes</b>.</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</p>
        <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      </div>`
  });
  console.log(`📧 Email OTP sent to ${email}`);
  return { sent: true };
}

// Send a plain notification email (e.g. contact-form message to admins).
// Throws if email is not configured.
export async function sendNotificationEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    throw new Error("Email service is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in backend/.env");
  }
  const transport = getMailTransport();
  await transport.sendMail({
    from: `"German Trainer Website" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
  console.log(`📧 Notification email sent to ${to}: ${subject}`);
  return { sent: true };
}

// Send OTP via SMS (real-time). Throws if Twilio is not configured.
export async function sendSmsOtp(phone, otp) {
  if (!isSmsConfigured()) {
    throw new Error(
      "SMS service is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in backend/.env"
    );
  }
  const client = getTwilioClient();
  await client.messages.create({
    body: `Your German Trainer verification code is ${otp}. It expires in 10 minutes.`,
    from: process.env.TWILIO_FROM_NUMBER,
    to: phone
  });
  console.log(`📱 SMS OTP sent to ${phone}`);
  return { sent: true };
}
