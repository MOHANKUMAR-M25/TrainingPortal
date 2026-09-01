// ============================================================
// Notification helpers for payments — email (SMTP) + SMS (Twilio).
// Reuses the transports from otp.js. All calls are fire-and-forget.
// ============================================================

import twilio from "twilio";
import dotenv from "dotenv";
import { sendNotificationEmail, isSmsConfigured } from "./otp.js";

dotenv.config();

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendSms(to, body) {
  if (!isSmsConfigured() || !to) return { skipped: true };
  const client = getTwilioClient();
  await client.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to });
  console.log(`📱 SMS sent to ${to}`);
  return { sent: true };
}

const INR = (amt) => `₹${Number(amt || 0).toLocaleString("en-IN")}`;

// ---------- Payment SUCCESS ----------
export function notifyPaymentSuccess({ name, email, phone, amount, sessionName, paymentId }) {
  const subject = `✅ Payment successful — ${sessionName}`;
  sendNotificationEmail({
    to: email,
    subject,
    text: `Hi ${name},\n\nWe've received your payment of ${INR(amount)} for "${sessionName}".\nPayment ID: ${paymentId}\n\nYour consultation is confirmed. See you soon!\n— Meenu, German Trainer`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#16a34a;margin-top:0">✅ Payment Successful</h2>
        <p style="font-size:14px;color:#333">Hi <b>${name}</b>, we've received your payment.</p>
        <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
          <tr><td style="padding:6px 0;width:110px;color:#888">Session</td><td style="padding:6px 0"><b>${sessionName}</b></td></tr>
          <tr><td style="padding:6px 0;color:#888">Amount</td><td style="padding:6px 0"><b>${INR(amount)}</b></td></tr>
          <tr><td style="padding:6px 0;color:#888">Payment ID</td><td style="padding:6px 0">${paymentId}</td></tr>
        </table>
        <p style="margin-top:14px;color:#888;font-size:12px">Your consultation is confirmed. — Meenu, German Trainer</p>
      </div>`
  }).catch((e) => console.error("⚠️ success email failed:", e.message));

  sendSms(phone, `Payment of ${INR(amount)} for ${sessionName} was successful. Your consultation is confirmed! — Meenu, German Trainer`)
    .catch((e) => console.error("⚠️ success SMS failed:", e.message));
}

// ---------- Payment FAILED ----------
export function notifyPaymentFailed({ name, email, phone, amount, sessionName, reason }) {
  const subject = `⚠️ Payment failed — ${sessionName}`;
  sendNotificationEmail({
    to: email,
    subject,
    text: `Hi ${name},\n\nYour payment of ${INR(amount)} for "${sessionName}" could not be completed.${reason ? "\nReason: " + reason : ""}\n\nNo money has been deducted (or it will be auto-refunded if it was). Please try again, or reply to this email for help.\n— Meenu, German Trainer`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#DD0000;margin-top:0">⚠️ Payment Failed</h2>
        <p style="font-size:14px;color:#333">Hi <b>${name}</b>, unfortunately your payment could not be completed.</p>
        <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse">
          <tr><td style="padding:6px 0;width:110px;color:#888">Session</td><td style="padding:6px 0"><b>${sessionName}</b></td></tr>
          <tr><td style="padding:6px 0;color:#888">Amount</td><td style="padding:6px 0">${INR(amount)}</td></tr>
          ${reason ? `<tr><td style="padding:6px 0;color:#888">Reason</td><td style="padding:6px 0">${reason}</td></tr>` : ""}
        </table>
        <p style="margin-top:14px;font-size:14px;color:#333">No money has been deducted (or it will be auto-refunded). Please try again.</p>
        <p style="margin-top:8px;color:#888;font-size:12px">— Meenu, German Trainer</p>
      </div>`
  }).catch((e) => console.error("⚠️ failed email failed:", e.message));

  sendSms(phone, `Your payment of ${INR(amount)} for ${sessionName} failed. No money deducted. Please try again. — Meenu, German Trainer`)
    .catch((e) => console.error("⚠️ failed SMS failed:", e.message));
}
