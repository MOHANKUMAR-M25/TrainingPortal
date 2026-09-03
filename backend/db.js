// ============================================================
// Supabase database layer.
// - Exposes a `supabase` client (or null if not configured).
// - Provides helper functions for tracking, bookings and payments.
// - All helpers fail SOFT: if Supabase isn't configured or a call
//   errors, we log and continue so the site keeps working.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
// Prefer the service-role key (full access); fall back to the publishable key.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

export function isDbConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export const supabase = isDbConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

// Generic insert helper (soft-fail)
async function insert(table, row) {
  if (!supabase) return { data: null, error: null, skipped: true };
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) console.error(`⚠️ Supabase insert into ${table} failed:`, error.message);
  return { data, error };
}

async function update(table, id, patch) {
  if (!supabase) return { data: null, error: null, skipped: true };
  const { data, error } = await supabase
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) console.error(`⚠️ Supabase update ${table} failed:`, error.message);
  return { data, error };
}

// ---------- Students ----------
// Ensures each student has a permanent, unique Candidate ID (CID).
// If the student already exists, their existing CID is preserved.
export async function upsertStudent({ email, name, phone, auth_provider, cid }) {
  if (!supabase) return { data: null };

  // Look up an existing student to preserve their CID (never regenerate)
  const { data: existing } = await supabase
    .from("students")
    .select("cid")
    .eq("email", email)
    .maybeSingle();

  let finalCid = existing?.cid || cid || null;
  if (!finalCid) {
    // Lazy import to avoid a circular import at module load
    const { generateUniqueCid } = await import("./cid.js");
    finalCid = await generateUniqueCid();
  }

  const row = { email, name, phone, auth_provider, cid: finalCid };
  const { data, error } = await supabase
    .from("students")
    .upsert(row, { onConflict: "email" })
    .select()
    .single();
  if (error) console.error("⚠️ upsertStudent failed:", error.message);
  return { data: data || row, error };
}

// ---------- Visitor tracking ----------
export function trackVisit(row) {
  return insert("visitors", row);
}

// ---------- Form activity ----------
export function trackFormActivity(row) {
  return insert("form_activity", row);
}

// ---------- Contact submissions ----------
export function saveContactSubmission(row) {
  return insert("contact_submissions", row);
}

// ---------- Bookings ----------
export function createBookingRow(row) {
  return insert("bookings", row);
}
export function updateBookingRow(id, patch) {
  return update("bookings", id, patch);
}

// ---------- Payments ----------
// These columns were added to the schema after the first deploys (coupons, then
// course enrollment). If a database hasn't had the migration in db/schema.sql
// re-run, inserting them fails — and losing the payment row would break the
// later verify-payment lookup by order id. So on failure we retry once with
// just the original columns.
const LATER_PAYMENT_COLUMNS = ["base_amount", "discount", "coupon_code", "item_name", "course_id"];

export async function createPaymentRow(row) {
  const result = await insert("payments", row);
  if (!result.error) return result;

  const hasLaterFields = LATER_PAYMENT_COLUMNS.some((col) => col in row);
  if (!hasLaterFields) return result;

  const fallback = { ...row };
  for (const col of LATER_PAYMENT_COLUMNS) delete fallback[col];

  console.warn(
    "⚠️ Retrying the payment insert without the coupon/enrollment columns. " +
      "Re-run backend/db/schema.sql in Supabase to record discounts and grant course access."
  );
  return insert("payments", fallback);
}
export function updatePaymentRow(id, patch) {
  return update("payments", id, patch);
}
export async function updatePaymentByOrderId(orderId, patch) {
  if (!supabase) return { data: null };
  const { data, error } = await supabase
    .from("payments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("razorpay_order_id", orderId)
    .select()
    .single();
  if (error) console.error("⚠️ updatePaymentByOrderId failed:", error.message);
  return { data, error };
}

// ============================================================
// Coupons & flash sale
//
// Supabase is the source of truth; backend/coupons.js keeps an
// in-memory cache so the pricing helpers can stay synchronous
// (they run inside the Razorpay create-order path).
//
// Every helper here soft-fails. If the tables are missing or the
// DB is unreachable the API falls back to the seed values in
// data/siteData.js — the site keeps selling, edits just don't
// survive a restart.
// ============================================================

// JS (camelCase, used everywhere in the app) → column (snake_case)
const COUPON_FIELDS = {
  code: "code",
  type: "type",
  value: "value",
  description: "description",
  appliesTo: "applies_to",
  courseIds: "course_ids",
  minAmount: "min_amount",
  maxDiscount: "max_discount",
  expiresAt: "expires_at",
  usageLimit: "usage_limit",
  usedCount: "used_count",
  active: "active",
  hidden: "hidden"
};

function rowToCoupon(row) {
  return {
    code: row.code,
    type: row.type || "percent",
    value: Number(row.value),
    description: row.description || "",
    appliesTo: row.applies_to || "all",
    courseIds: Array.isArray(row.course_ids) ? row.course_ids : [],
    minAmount: Number(row.min_amount || 0),
    maxDiscount: row.max_discount == null ? null : Number(row.max_discount),
    expiresAt: row.expires_at || null,
    usageLimit: row.usage_limit == null ? null : Number(row.usage_limit),
    usedCount: Number(row.used_count || 0),
    active: row.active !== false,
    hidden: Boolean(row.hidden)
  };
}

// Only maps keys that are actually present, so the same function
// serves both full inserts and partial updates.
function couponToRow(patch) {
  const row = {};
  for (const [jsKey, column] of Object.entries(COUPON_FIELDS)) {
    if (patch[jsKey] !== undefined) row[column] = patch[jsKey];
  }
  return row;
}

/** All coupons, oldest first. `skipped` means "no DB configured". */
export async function fetchCoupons() {
  if (!supabase) return { data: null, skipped: true };
  const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("⚠️ fetchCoupons failed:", error.message);
    return { data: null, error };
  }
  return { data: (data || []).map(rowToCoupon) };
}

export async function insertCoupon(coupon) {
  if (!supabase) return { data: null, skipped: true };
  const { data, error } = await supabase.from("coupons").insert(couponToRow(coupon)).select().single();
  if (error) console.error("⚠️ insertCoupon failed:", error.message);
  return { data: data ? rowToCoupon(data) : null, error };
}

export async function updateCouponRow(code, patch) {
  if (!supabase) return { data: null, skipped: true };
  const { data, error } = await supabase
    .from("coupons")
    .update({ ...couponToRow(patch), updated_at: new Date().toISOString() })
    .eq("code", code)
    .select()
    .single();
  if (error) console.error("⚠️ updateCouponRow failed:", error.message);
  return { data: data ? rowToCoupon(data) : null, error };
}

export async function deleteCouponRow(code) {
  if (!supabase) return { data: null, skipped: true };
  const { error } = await supabase.from("coupons").delete().eq("code", code);
  if (error) console.error("⚠️ deleteCouponRow failed:", error.message);
  return { error };
}

/**
 * Persists a redemption count. The authoritative value is computed from the
 * in-memory cache and written here — this app runs single-instance, and the
 * counter is advisory (it gates `usageLimit`, it isn't an accounting record).
 */
export async function saveCouponUsage(code, usedCount) {
  if (!supabase) return { skipped: true };
  const { error } = await supabase
    .from("coupons")
    .update({ used_count: usedCount, updated_at: new Date().toISOString() })
    .eq("code", code);
  if (error) console.error("⚠️ saveCouponUsage failed:", error.message);
  return { error };
}

/** First-run seed: writes the siteData defaults into an empty table. */
export async function seedCoupons(coupons) {
  if (!supabase) return { data: null, skipped: true };
  const rows = coupons.map(couponToRow);
  const { data, error } = await supabase.from("coupons").upsert(rows, { onConflict: "code" }).select();
  if (error) console.error("⚠️ seedCoupons failed:", error.message);
  return { data: (data || []).map(rowToCoupon), error };
}

// ---------- Flash sale (single row, id = 1) ----------

function rowToFlashSale(row) {
  return {
    active: Boolean(row.active),
    headline: row.headline || "",
    subtext: row.subtext || "",
    code: row.code || "",
    endsAt: row.ends_at || null,
    ctaLabel: row.cta_label || "",
    ctaHref: row.cta_href || "#courses"
  };
}

export async function fetchFlashSale() {
  if (!supabase) return { data: null, skipped: true };
  const { data, error } = await supabase.from("flash_sale").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("⚠️ fetchFlashSale failed:", error.message);
    return { data: null, error };
  }
  return { data: data ? rowToFlashSale(data) : null };
}

export async function saveFlashSale(sale) {
  if (!supabase) return { data: null, skipped: true };
  const { data, error } = await supabase
    .from("flash_sale")
    .upsert(
      {
        id: 1,
        active: Boolean(sale.active),
        headline: sale.headline || "",
        subtext: sale.subtext || "",
        code: sale.code || null,
        ends_at: sale.endsAt || null,
        cta_label: sale.ctaLabel || "",
        cta_href: sale.ctaHref || "#courses",
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) console.error("⚠️ saveFlashSale failed:", error.message);
  return { data: data ? rowToFlashSale(data) : null, error };
}

// ---------- Dashboard reads ----------
export async function fetchDashboard() {
  if (!supabase) {
    return {
      configured: false,
      note: "Supabase is not configured. Add SUPABASE_URL and a key to backend/.env.",
      students: [],
      visitors: [],
      contacts: [],
      formActivity: [],
      bookings: [],
      payments: [],
      stats: {}
    };
  }

  const limit = 200;
  const [students, visitors, contacts, formActivity, bookings, payments] = await Promise.all([
    supabase.from("students").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("visitors").select("*").order("visited_at", { ascending: false }).limit(limit),
    supabase.from("contact_submissions").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("form_activity").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(limit)
  ]);

  const b = bookings.data || [];
  const p = payments.data || [];
  const c = contacts.data || [];

  const stats = {
    totalVisitors: (visitors.data || []).length,
    totalStudents: (students.data || []).length,
    contactsSubmitted: c.filter((x) => x.status === "submitted").length,
    contactsPartial: (formActivity.data || []).filter((x) => x.event === "form_abandon").length,
    callbackRequests: c.filter((x) => x.status === "callback_requested").length,
    bookingsAttempted: b.filter((x) => x.status === "attempted").length,
    bookingsBooked: b.filter((x) => ["booked", "paid"].includes(x.status)).length,
    bookingsAbandoned: b.filter((x) => x.status === "abandoned").length,
    paymentsCaptured: p.filter((x) => x.status === "captured").length,
    paymentsFailed: p.filter((x) => x.status === "failed").length,
    paymentsPending: p.filter((x) => ["created", "authorized"].includes(x.status)).length,
    revenue: p.filter((x) => x.status === "captured").reduce((sum, x) => sum + Number(x.amount || 0), 0)
  };

  return {
    configured: true,
    students: students.data || [],
    visitors: visitors.data || [],
    contacts: c,
    formActivity: formActivity.data || [],
    bookings: b,
    payments: p,
    stats
  };
}
