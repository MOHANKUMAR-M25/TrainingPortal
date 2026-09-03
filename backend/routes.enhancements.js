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
import { resolveOrderContext, quoteWithCoupon, markCouponUsed } from "./coupons.js";
import { grantEnrollment } from "./learning.js";
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
  //
  // PRICING IS SERVER-AUTHORITATIVE.
  // When the client identifies WHAT it is buying (`courseId` for a course or
  // `sessionId` for a consultation session), the base price is read from
  // siteData and the coupon is re-validated here. The client's own `amount`
  // is ignored in that case, so a tampered payload cannot lower the price.
  //
  // `amount` is still honoured as a fallback for callers that do not reference
  // a catalogue item; coupons are not available on that path.
  router.post("/create-order", async (req, res) => {
    try {
      const {
        amount,
        currency = "INR",
        receipt,
        name,
        email,
        phone,
        courseId,
        sessionId,
        sessionName,
        bookingId,
        couponCode
      } = req.body || {};

      let baseAmount;
      let payableAmount;
      let discount = 0;
      let appliedCode = null;
      let itemName = sessionName || "";

      const context = resolveOrderContext({ courseId, sessionId });

      if (context.ok) {
        baseAmount = context.amount;
        if (baseAmount < 1) {
          return res.status(400).json({ error: "This item has no payable price set." });
        }
        itemName = context.itemName;

        const quote = quoteWithCoupon({
          code: couponCode,
          amount: baseAmount,
          scope: context.scope,
          courseId: context.courseId
        });

        // A coupon that turns out to be invalid at this point must not
        // silently charge full price — the user was shown a discount.
        if (couponCode && !quote.valid) {
          return res.status(400).json({ error: quote.reason || "That coupon could not be applied." });
        }

        payableAmount = quote.finalAmount;
        discount = quote.discount;
        appliedCode = quote.valid ? quote.code : null;
      } else {
        // Legacy / non-catalogue path — trust the client amount, no coupons.
        baseAmount = Number(amount);
        if (!Number.isFinite(baseAmount) || baseAmount < 1) {
          return res.status(400).json({ error: context.error || "A valid amount is required." });
        }
        if (couponCode) {
          return res
            .status(400)
            .json({ error: "A coupon needs a courseId or sessionId so the discount can be verified." });
        }
        payableAmount = baseAmount;
      }

      const amountInPaise = Math.round(payableAmount * 100);
      const order = await createOrder({
        amountInPaise,
        currency,
        receipt: receipt || `booking_${bookingId || Date.now()}`,
        notes: {
          name,
          email,
          phone,
          sessionName: itemName,
          couponCode: appliedCode || "",
          discount: String(discount)
        }
      });

      // Persist a payment row (status: created)
      await createPaymentRow({
        booking_id: bookingId || null,
        razorpay_order_id: order.id,
        amount: payableAmount,
        base_amount: baseAmount,
        discount,
        coupon_code: appliedCode,
        item_name: itemName,
        currency,
        status: "created",
        name,
        email,
        phone,
        // Recorded so enrollment is granted from the server's own payment
        // record — a client cannot pay for one course and claim another.
        course_id: context.ok && context.courseId != null ? Number(context.courseId) : null
      });

      res.json({
        order_id: order.id,
        amount: order.amount, // paise — what Razorpay will actually charge
        currency: order.currency,
        keyId: getPublicKeyId(),
        // Echo the verified numbers so the UI can show the real total.
        baseAmount,
        discount,
        payableAmount,
        couponCode: appliedCode
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
      sessionName,
      couponCode
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
    const { data: paymentRow } = await updatePaymentByOrderId(razorpay_order_id, {
      razorpay_payment_id,
      razorpay_signature,
      status: "captured"
    });
    if (bookingId) await updateBookingRow(bookingId, { status: "paid" });

    // Course purchase → grant access to the modules + assessment.
    // `course_id` and `email` come from the stored payment row, so the grant
    // reflects what was actually paid for rather than what the client claims.
    if (paymentRow?.course_id != null) {
      await grantEnrollment({
        email: paymentRow.email || email,
        name: paymentRow.name || name,
        courseId: paymentRow.course_id,
        razorpayOrderId: razorpay_order_id
      });
    }

    // Count the redemption only now — a verified signature proves a real
    // payment happened, so this cannot be inflated by an unpaid caller.
    if (couponCode) markCouponUsed(couponCode);

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
