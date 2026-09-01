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
export function createPaymentRow(row) {
  return insert("payments", row);
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
