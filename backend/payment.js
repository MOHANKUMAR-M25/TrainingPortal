// ============================================================
// Razorpay Standard Checkout — order creation + signature verify.
// The KEY_SECRET stays on the backend only.
// ============================================================

import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export function isRazorpayConfigured() {
  return Boolean(KEY_ID && KEY_SECRET);
}

let client = null;
function getClient() {
  if (!client && isRazorpayConfigured()) {
    client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  }
  return client;
}

// The public Key ID is safe to expose to the frontend.
export function getPublicKeyId() {
  return KEY_ID || "";
}

/**
 * Create a Razorpay order.
 * @param {number} amountInPaise  integer >= 100
 * @param {string} currency       e.g. "INR"
 * @param {string} receipt        your reference id
 */
export async function createOrder({ amountInPaise, currency = "INR", receipt, notes }) {
  if (!isRazorpayConfigured()) {
    const err = new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to backend/.env");
    err.status = 503;
    throw err;
  }
  const amount = Math.round(Number(amountInPaise));
  if (!Number.isFinite(amount) || amount < 100) {
    const err = new Error("Amount must be at least 100 paise (₹1).");
    err.status = 400;
    throw err;
  }

  const order = await getClient().orders.create({
    amount,
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
    notes: notes || {}
  });
  return order; // { id, amount, currency, receipt, ... }
}

/**
 * Verify the payment signature.
 * HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) === razorpay_signature
 */
export function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { valid: false, reason: "Missing required fields." };
  }
  const expected = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const valid =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));

  return { valid, reason: valid ? "" : "Signature mismatch." };
}
