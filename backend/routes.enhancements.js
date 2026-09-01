// ============================================================
// Enhancement routes (mounted in server.js):
//   - Visitor & form-activity tracking
//   - Request-a-callback + partial contact tracking (no login)
//   - Booking lifecycle tracking (attempted / abandoned / booked)
//   - Razorpay: create-order, verify-payment, payment-failed
//   - Admin dashboard data
// Uses Supabase (soft-fail) so the site keeps working if the DB
// isn't reachable.
// ============================================================

import express from "express";
import {
  isDbConfigured,
  trackVisit,
  trackFormActivity,
  saveContactSubmission,
  createBookingRow,
  updateBookingRow,
  createPaymentRow,
  updatePaymentByOrderId,
  upsertStudent,
  fetchDashboard
} from "./db.js";
import {
  isRazorpayConfigured,
  getPublicKeyId,
  createOrder,
  verifySignature
} from "./payment.js";
import { notifyPaymentSuccess, notifyPaymentFailed } from "./notify.js";

export function registerEnhancementRoutes(app, { requireAdmin, adminEmails, sendNotificationEmail }) {
  const router = express.Router();

  const clientIp = (req) =>
    (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim();

  // ---------- Config / status ----------
  router.get("/config", (_req, res) => {
    res.json({
      dbConfigured: isDbConfigured(),
      razorpayConfigured: isRazorpayConfigured(),
      razorpayKeyId: getPublicKeyId() // public key — safe for the frontend
    });
  });

  // ---------- Visitor tracking ----------
  router.post("/track/visit", async (req, res) => {
    const { sessionId, page, referrer, email } = req.body || {};
    await trackVisit({
      session_id: sessionId || null,
      page: page || "/",
      referrer: referrer || "",
      user_agent: req.headers["user-agent"] || "",
      ip: clientIp(req),
      email: email || (req.user?.email ?? null)
    });
    res.json({ ok: true });
  });

  // ---------- Form activity (start / abandon / submit) ----------
  router.post("/track/form", async (req, res) => {
    const { sessionId, formName, event, filledFields, email } = req.body || {};
    await trackFormActivity({
      session_id: sessionId || null,
      form_name: formName || "unknown",
      event: event || "form_start",
      filled_fields: filledFields || {},
      email: email || (req.user?.email ?? null)
    });
    res.json({ ok: true });
  });

  // ---------- Request a callback (no login required) ----------
  router.post("/callback", async (req, res) => {
    const { name, phone, email, message } = req.body || {};
    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone number are required." });
    }
    await saveContactSubmission({
      name,
      phone,
      email: email || "",
      subject: "Callback request",
      message: message || "",
      status: "callback_requested",
      source: "callback"
    });

    // Notify admins (fire-and-forget)
    sendNotificationEmail?.({
      to: adminEmails.join(","),
      subject: `📞 Callback requested by ${name} (${phone})`,
      text: `New callback request:\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email || "—"}\nMessage: ${message || "—"}`
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Thanks ${name}! Meenu will call you back on ${phone} soon.`
    });
  });

  // ---------- Booking lifecycle tracking ----------
  // Called when a student starts/attempts a booking (before paying)
  router.post("/booking/attempt", async (req, res) => {
    const { name, email, phone, sessionId, sessionName, amount, slotStart, slotEnd, notes } = req.body || {};
    const { data } = await createBookingRow({
      name,
      email,
      phone: phone || "",
      session_id: sessionId ?? null,
      session_name: sessionName || "",
      amount: amount ?? null,
      slot_start: slotStart || null,
      slot_end: slotEnd || null,
      notes: notes || "",
      status: "attempted"
    });
    res.json({ ok: true, bookingId: data?.id || null });
  });

  // Called if the student left without completing ("tried but didn't book")
  router.post("/booking/abandon", async (req, res) => {
    const { bookingId } = req.body || {};
    if (bookingId) await updateBookingRow(bookingId, { status: "abandoned" });
    res.json({ ok: true });
  });

  // ---------- Razorpay: create order ----------
  router.post("/create-order", async (req, res) => {
    try {
      const { amount, currency = "INR", receipt, name, email, phone, sessionId, sessionName, bookingId } = req.body || {};
      // amount is in rupees from the client; convert to paise
      const amountInPaise = Math.round(Number(amount) * 100);
      const order = await createOrder({
        amountInPaise,
        currency,
        receipt: receipt || `booking_${bookingId || Date.now()}`,
        notes: { name, email, phone, sessionName }
      });

      // Persist a payment row (status: created)
      await createPaymentRow({
        booking_id: bookingId || null,
        razorpay_order_id: order.id,
        amount: Number(amount),
        currency,
        status: "created",
        name,
        email,
        phone
      });

      res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: getPublicKeyId()
      });
    } catch (err) {
      console.error("create-order error:", err.message);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // ---------- Razorpay: verify payment ----------
  router.post("/verify-payment", async (req, res) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      name,
      email,
      phone,
      amount,
      sessionName
    } = req.body || {};

    const { valid, reason } = verifySignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!valid) {
      // Do NOT mark as paid
      await updatePaymentByOrderId(razorpay_order_id, {
        razorpay_payment_id: razorpay_payment_id || null,
        status: "failed",
        error_reason: reason
      });
      if (bookingId) await updateBookingRow(bookingId, { status: "payment_failed" });
      notifyPaymentFailed({ name, email, phone, amount, sessionName, reason });
      return res.status(400).json({ success: false, error: reason });
    }

    // Signature valid → mark captured
    await updatePaymentByOrderId(razorpay_order_id, {
      razorpay_payment_id,
      razorpay_signature,
      status: "captured"
    });
    if (bookingId) await updateBookingRow(bookingId, { status: "paid" });

    notifyPaymentSuccess({ name, email, phone, amount, sessionName, paymentId: razorpay_payment_id });

    res.json({ success: true, message: "Payment verified successfully." });
  });

  // ---------- Razorpay: client reported a failed/dismissed payment ----------
  router.post("/payment-failed", async (req, res) => {
    const { razorpay_order_id, bookingId, name, email, phone, amount, sessionName, reason } = req.body || {};
    if (razorpay_order_id) {
      await updatePaymentByOrderId(razorpay_order_id, {
        status: "failed",
        error_reason: reason || "Payment failed or dismissed by user."
      });
    }
    if (bookingId) await updateBookingRow(bookingId, { status: "payment_failed" });
    notifyPaymentFailed({ name, email, phone, amount, sessionName, reason });
    res.json({ ok: true });
  });

  // ---------- Admin dashboard data ----------
  router.get("/admin/dashboard", requireAdmin, async (_req, res) => {
    try {
      const data = await fetchDashboard();
      res.json(data);
    } catch (err) {
      console.error("dashboard error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Expose student upsert for the auth flows (called from server.js too)
  router.post("/track/student", async (req, res) => {
    const { email, name, phone, auth_provider } = req.body || {};
    if (email) await upsertStudent({ email, name, phone, auth_provider: auth_provider || "otp" });
    res.json({ ok: true });
  });

  app.use("/api", router);
}
