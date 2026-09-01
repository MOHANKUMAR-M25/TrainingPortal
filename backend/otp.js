// ============================================================
// OTP service — Email + SMS
//   Email: SendGrid HTTPS API (preferred, proxy-friendly) with
//          SMTP (Nodemailer) as a fallback.
//   SMS:   Twilio.
// Used for student sign-up verification and site notifications.
// ============================================================

import nodemailer from "nodemailer";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

// ---------- Config detection ----------
export function isSendgridConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM);
}

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Email works if EITHER SendGrid (HTTPS) or SMTP is configured
export function isEmailConfigured() {
  return isSendgridConfigured() || isSmtpConfigured();
}

export function isSmsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

// ---------- SendGrid (HTTPS API) ----------
// Sends via https://api.sendgrid.com — works behind corporate proxies
// that block raw SMTP ports.
async function sendViaSendgrid({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM; // must be a verified sender in SendGrid
  const toList = String(to)
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: toList }],
      from: { email: from, name: "German Trainer — Meenu" },
      subject,
      content: [
        { type: "text/plain", value: text || "" },
        ...(html ? [{ type: "text/html", value: html }] : [])
      ]
    })
  });

  if (!(res.status === 202 || res.ok)) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendGrid API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return { sent: true };
}

// ---------- SMTP (Nodemailer) fallback ----------
let mailTransport = null;
function getMailTransport() {
  if (!mailTransport && isSmtpConfigured()) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = port === 465;
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000
    });
  }
  return mailTransport;
}

async function sendViaSmtp({ from, to, subject, text, html }) {
  const transport = getMailTransport();
  await transport.sendMail({ from, to, subject, text, html });
  return { sent: true };
}

// Unified email sender: prefers SendGrid, falls back to SMTP.
async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set SENDGRID_API_KEY + EMAIL_FROM (recommended) or SMTP_HOST/USER/PASS in backend/.env"
    );
  }
  if (isSendgridConfigured()) {
    try {
      const r = await sendViaSendgrid({ to, subject, text, html });
      console.log(`📧 Email sent via SendGrid to ${to}: ${subject}`);
      return r;
    } catch (err) {
      console.warn("⚠️ SendGrid send failed:", err.message);
      if (!isSmtpConfigured()) throw err; // no fallback available
    }
  }
  // SMTP fallback
  const r = await sendViaSmtp({
    from: `"German Trainer" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html
  });
  console.log(`📧 Email sent via SMTP to ${to}: ${subject}`);
  return r;
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

// Send OTP via email (real-time).
export async function sendEmailOtp(email, otp) {
  await sendEmail({
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

// Send a plain notification email (contact-form message, booking, etc.).
export async function sendNotificationEmail({ to, subject, text, html }) {
  return sendEmail({ to, subject, text, html });
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
