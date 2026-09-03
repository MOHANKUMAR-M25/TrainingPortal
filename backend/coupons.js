// ============================================================
// Coupons & Flash Sale — SERVER-SIDE pricing authority.
//
// Why this module exists:
//   The browser must never decide what a customer pays. Every
//   discount is re-computed here before a Razorpay order is
//   created, so a tampered client payload ("amount: 1") cannot
//   buy a ₹9,999 course.
//
// The frontend calls POST /api/coupons/validate purely to show
// a preview; the authoritative number is recomputed inside
// /api/create-order using these same functions.
//
// STORAGE MODEL
//   Supabase is the source of truth. `hydrateCouponStore()` loads
//   the tables into `siteData` at startup and every admin write
//   goes to the DB *and* the in-memory copy. Reads therefore stay
//   synchronous, which matters because `quoteWithCoupon()` runs
//   inside the payment path.
//
//   With no Supabase configured (or the migration not yet run)
//   everything falls back to the seed values in data/siteData.js:
//   the site keeps selling, edits just don't survive a restart.
// ============================================================

import { siteData } from "./data/siteData.js";
import {
  isDbConfigured,
  fetchCoupons,
  insertCoupon,
  updateCouponRow,
  deleteCouponRow,
  saveCouponUsage,
  seedCoupons,
  fetchFlashSale,
  saveFlashSale
} from "./db.js";

// Razorpay rejects orders below ₹1 (100 paise).
const MIN_PAYABLE_RUPEES = 1;

/**
 * "₹9,999" → 9999 · "₹4,999/month" → 4999 · "" → 0
 * Strips currency symbols, thousands separators and suffixes.
 */
export function parsePriceToRupees(price) {
  if (typeof price === "number") return Number.isFinite(price) ? price : 0;
  const cleaned = String(price || "").replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Formats rupees for display: 7499 → "₹7,499" */
export function formatRupees(amount) {
  return "₹" + Math.round(Number(amount) || 0).toLocaleString("en-IN");
}

/** Codes are compared case-insensitively and whitespace-insensitively. */
export function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isExpired(isoDate) {
  if (!isoDate) return false;
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return false; // an unparseable date should not block a sale
  return t < Date.now();
}

// ---------- Flash sale ----------

/**
 * The flash sale as the public site should see it.
 * Returns `{ active: false }` once `endsAt` has passed, so the
 * banner disappears on its own without an admin edit.
 */
export function getPublicFlashSale() {
  const sale = siteData.flashSale;
  if (!sale || !sale.active || isExpired(sale.endsAt)) {
    return { active: false };
  }
  // Only advertise the code if it is still a valid, non-hidden coupon.
  const coupon = findCoupon(sale.code);
  const codeIsLive = coupon && isCouponLive(coupon) && !coupon.hidden;

  return {
    active: true,
    headline: sale.headline || "",
    subtext: sale.subtext || "",
    code: codeIsLive ? normalizeCode(sale.code) : "",
    endsAt: sale.endsAt || null,
    ctaLabel: sale.ctaLabel || "",
    ctaHref: sale.ctaHref || "#courses",
    discountLabel: coupon ? describeCoupon(coupon) : ""
  };
}

// ---------- Coupon lookup ----------

export function findCoupon(code) {
  const wanted = normalizeCode(code);
  if (!wanted) return null;
  return (siteData.coupons || []).find((c) => normalizeCode(c.code) === wanted) || null;
}

/** Active, not expired, and not exhausted. */
export function isCouponLive(coupon) {
  if (!coupon || coupon.active === false) return false;
  if (isExpired(coupon.expiresAt)) return false;
  if (coupon.usageLimit != null && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) return false;
  return true;
}

/** "25% OFF" / "₹500 OFF" — for banners and chips. */
export function describeCoupon(coupon) {
  if (!coupon) return "";
  return coupon.type === "percent" ? `${coupon.value}% OFF` : `${formatRupees(coupon.value)} OFF`;
}

/**
 * Publicly advertisable coupons (hidden/expired ones are omitted).
 * Safe to send to the browser — contains no usage counts.
 */
export function getPublicCoupons() {
  return (siteData.coupons || [])
    .filter((c) => isCouponLive(c) && !c.hidden)
    .map((c) => ({
      code: normalizeCode(c.code),
      description: c.description || "",
      label: describeCoupon(c),
      appliesTo: c.appliesTo || "all",
      minAmount: Number(c.minAmount || 0),
      expiresAt: c.expiresAt || null
    }));
}

// ---------- Order context resolution ----------

/**
 * Resolves what is being bought into a trusted price.
 *
 * Pass a `courseId` OR a `sessionId` — the price is then read from
 * `siteData`, never from the request body.
 *
 * @returns {{ ok: boolean, error?: string, amount?: number,
 *             scope?: "courses"|"consultation", itemName?: string,
 *             courseId?: number|null }}
 */
export function resolveOrderContext({ courseId, sessionId }) {
  if (courseId != null && courseId !== "") {
    const course = (siteData.courses || []).find((c) => String(c.id) === String(courseId));
    if (!course) return { ok: false, error: "That course no longer exists." };
    return {
      ok: true,
      amount: parsePriceToRupees(course.price),
      scope: "courses",
      itemName: `Course: ${course.title}`,
      courseId: course.id
    };
  }

  if (sessionId != null && sessionId !== "") {
    const session = (siteData.consultation?.sessions || []).find((s) => String(s.id) === String(sessionId));
    if (!session) return { ok: false, error: "That consultation session no longer exists." };
    return {
      ok: true,
      amount: parsePriceToRupees(session.price),
      scope: "consultation",
      itemName: `${session.name} (${session.price})`,
      courseId: null
    };
  }

  return { ok: false, error: "Provide a courseId or a sessionId." };
}

// ---------- Validation & quoting ----------

/**
 * Applies a coupon to a trusted base amount and returns a full quote.
 *
 * Always resolves (never throws) so callers can surface `reason`
 * directly to the user. When the code is invalid the quote falls
 * back to the undiscounted amount, so a bad code can never make an
 * order cheaper OR block a purchase.
 *
 * @param {object}  args
 * @param {string}  args.code       the code the user typed
 * @param {number}  args.amount     trusted base price in rupees
 * @param {string}  args.scope      "courses" | "consultation"
 * @param {number}  [args.courseId] for course-specific coupons
 */
export function quoteWithCoupon({ code, amount, scope, courseId }) {
  const baseAmount = Math.max(0, Number(amount) || 0);
  const noDiscount = {
    valid: false,
    code: normalizeCode(code),
    baseAmount,
    discount: 0,
    finalAmount: baseAmount,
    label: "",
    description: "",
    reason: ""
  };

  const wanted = normalizeCode(code);
  if (!wanted) return { ...noDiscount, reason: "" }; // no code entered — not an error

  const coupon = findCoupon(wanted);
  if (!coupon) {
    return { ...noDiscount, reason: `"${wanted}" is not a valid coupon code.` };
  }
  if (coupon.active === false) {
    return { ...noDiscount, reason: `Coupon "${wanted}" is no longer active.` };
  }
  if (isExpired(coupon.expiresAt)) {
    return { ...noDiscount, reason: `Coupon "${wanted}" has expired.` };
  }
  if (coupon.usageLimit != null && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
    return { ...noDiscount, reason: `Coupon "${wanted}" has reached its redemption limit.` };
  }

  // Scope check — a consultation code must not work on courses.
  const appliesTo = coupon.appliesTo || "all";
  if (appliesTo !== "all" && scope && appliesTo !== scope) {
    const human = appliesTo === "courses" ? "German courses" : "one-on-one consultations";
    return { ...noDiscount, reason: `Coupon "${wanted}" is only valid on ${human}.` };
  }

  // Course whitelist check.
  const whitelist = Array.isArray(coupon.courseIds) ? coupon.courseIds : [];
  if (whitelist.length && scope === "courses") {
    const allowed = whitelist.some((id) => String(id) === String(courseId));
    if (!allowed) {
      return { ...noDiscount, reason: `Coupon "${wanted}" does not apply to this course.` };
    }
  }

  // Minimum order value.
  const minAmount = Number(coupon.minAmount || 0);
  if (baseAmount < minAmount) {
    return {
      ...noDiscount,
      reason: `Coupon "${wanted}" needs a minimum order of ${formatRupees(minAmount)}.`
    };
  }

  // ---- Compute the discount ----
  let discount =
    coupon.type === "percent"
      ? (baseAmount * Number(coupon.value || 0)) / 100
      : Number(coupon.value || 0);

  if (coupon.type === "percent" && coupon.maxDiscount != null) {
    discount = Math.min(discount, Number(coupon.maxDiscount));
  }

  discount = Math.round(discount);

  // Never discount below the minimum Razorpay can charge, and never negative.
  discount = Math.max(0, Math.min(discount, baseAmount - MIN_PAYABLE_RUPEES));

  if (discount <= 0) {
    return { ...noDiscount, reason: `Coupon "${wanted}" cannot be applied to this amount.` };
  }

  return {
    valid: true,
    code: normalizeCode(coupon.code),
    baseAmount,
    discount,
    finalAmount: baseAmount - discount,
    label: describeCoupon(coupon),
    description: coupon.description || "",
    reason: ""
  };
}

/**
 * Records a redemption after a payment is verified.
 * Updates the cache immediately and persists in the background — the
 * customer's payment response must not wait on the counter.
 */
export function markCouponUsed(code) {
  const coupon = findCoupon(code);
  if (!coupon) return;
  coupon.usedCount = Number(coupon.usedCount || 0) + 1;
  saveCouponUsage(normalizeCode(coupon.code), coupon.usedCount).catch(() => {});
}

// ---------- Admin helpers ----------

const VALID_TYPES = ["percent", "flat"];
const VALID_SCOPES = ["all", "courses", "consultation"];

/**
 * Validates and normalizes an admin-submitted coupon payload.
 * @throws {Error} with `.status = 400` on invalid input
 */
export function normalizeCouponInput(body = {}, { partial = false } = {}) {
  const fail = (msg) => {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  };

  const out = {};

  if (!partial || body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code) fail("A coupon code is required.");
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      fail("Coupon codes must be 3–24 characters: letters, numbers, hyphen or underscore.");
    }
    out.code = code;
  }

  if (!partial || body.type !== undefined) {
    const type = String(body.type || "").toLowerCase();
    if (!VALID_TYPES.includes(type)) fail(`Coupon type must be one of: ${VALID_TYPES.join(", ")}.`);
    out.type = type;
  }

  if (!partial || body.value !== undefined) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) fail("Coupon value must be a positive number.");
    const type = out.type || String(body.type || "").toLowerCase();
    if (type === "percent" && value > 100) fail("A percent discount cannot exceed 100.");
    out.value = value;
  }

  if (body.appliesTo !== undefined) {
    const appliesTo = String(body.appliesTo || "all").toLowerCase();
    if (!VALID_SCOPES.includes(appliesTo)) fail(`appliesTo must be one of: ${VALID_SCOPES.join(", ")}.`);
    out.appliesTo = appliesTo;
  }

  if (body.courseIds !== undefined) {
    const ids = Array.isArray(body.courseIds)
      ? body.courseIds
      : String(body.courseIds || "").split(",");
    out.courseIds = ids
      .map((id) => Number(String(id).trim()))
      .filter((id) => Number.isFinite(id));
  }

  if (body.expiresAt !== undefined) {
    const raw = String(body.expiresAt || "").trim();
    if (raw && Number.isNaN(Date.parse(raw))) fail("expiresAt must be a valid date.");
    out.expiresAt = raw || null;
  }

  if (body.description !== undefined) out.description = String(body.description || "");
  if (body.minAmount !== undefined) out.minAmount = Math.max(0, Number(body.minAmount) || 0);
  if (body.maxDiscount !== undefined) {
    out.maxDiscount =
      body.maxDiscount === null || body.maxDiscount === "" ? null : Math.max(0, Number(body.maxDiscount) || 0);
  }
  if (body.usageLimit !== undefined) {
    out.usageLimit =
      body.usageLimit === null || body.usageLimit === "" ? null : Math.max(1, Number(body.usageLimit) || 1);
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.hidden !== undefined) out.hidden = Boolean(body.hidden);

  return out;
}

/** Full coupon list with usage stats — admins only. */
export function listCouponsForAdmin() {
  return (siteData.coupons || []).map((c) => ({
    ...c,
    code: normalizeCode(c.code),
    label: describeCoupon(c),
    live: isCouponLive(c)
  }));
}

// ============================================================
// Persistence — Supabase source of truth + in-memory cache
// ============================================================

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * A `skipped` result means no database is configured, which is a supported
 * mode — carry on with the in-memory change. A real `error` means the DB
 * rejected a write, and an admin must not be told "saved" in that case:
 * the edit would silently disappear on the next restart.
 */
function assertPersisted(result, what) {
  const error = result?.error;
  if (!error) return;

  // 42P01 = undefined_table. Almost always means schema.sql hasn't been run.
  const tableMissing =
    error.code === "42P01" || /relation .*does not exist|could not find the table/i.test(error.message || "");

  if (tableMissing) {
    httpError(
      `${what} was not saved — the coupons tables don't exist yet. ` +
        "Run backend/db/schema.sql in the Supabase SQL editor, then restart the API.",
      503
    );
  }

  httpError(`${what} was not saved — the database rejected the change: ${error.message}`, 502);
}

/**
 * Loads coupons + the flash sale from Supabase into `siteData`.
 * Call once at startup, before the server accepts traffic.
 *
 * On a fresh database the seed values in data/siteData.js are written out,
 * so the site launches with the same defaults it ships with.
 *
 * @returns {Promise<{source: string, note?: string, count?: number}>}
 */
export async function hydrateCouponStore() {
  if (!isDbConfigured()) {
    return {
      source: "memory",
      note: "Supabase not configured — coupon edits will reset when the server restarts."
    };
  }

  const [couponResult, saleResult] = await Promise.all([fetchCoupons(), fetchFlashSale()]);

  // Missing table / unreachable DB → keep the file defaults and say so.
  if (couponResult.error) {
    return {
      source: "seed",
      note: "Could not read the coupons table — run backend/db/schema.sql in Supabase. Using the defaults from data/siteData.js for now."
    };
  }

  if (couponResult.data?.length) {
    siteData.coupons = couponResult.data;
  } else {
    // Empty table: first run against this database.
    const seeded = await seedCoupons(siteData.coupons || []);
    if (seeded.data?.length) siteData.coupons = seeded.data;
  }

  if (saleResult.data) {
    siteData.flashSale = { ...siteData.flashSale, ...saleResult.data };
  } else if (!saleResult.error) {
    // No banner row yet — persist the shipped default.
    await saveFlashSale(siteData.flashSale || {});
  }

  return { source: "supabase", count: (siteData.coupons || []).length };
}

/**
 * Creates a coupon (validated), persists it, then adds it to the cache.
 * @throws {Error} with `.status` 400 / 409 / 502
 */
export async function createCoupon(body) {
  const input = normalizeCouponInput(body);

  if (findCoupon(input.code)) {
    httpError(`Coupon "${input.code}" already exists.`, 409);
  }

  const coupon = {
    code: input.code,
    type: input.type,
    value: input.value,
    description: input.description || "",
    appliesTo: input.appliesTo || "all",
    courseIds: input.courseIds || [],
    minAmount: input.minAmount ?? 0,
    maxDiscount: input.maxDiscount ?? null,
    expiresAt: input.expiresAt ?? null,
    usageLimit: input.usageLimit ?? null,
    usedCount: 0,
    active: input.active ?? true,
    hidden: input.hidden ?? false
  };

  assertPersisted(await insertCoupon(coupon), `Coupon "${coupon.code}"`);

  siteData.coupons.push(coupon);
  return coupon;
}

/**
 * Applies a partial update to a coupon, persists it, then updates the cache.
 * @throws {Error} with `.status` 400 / 404 / 409 / 502
 */
export async function updateCoupon(code, body) {
  const coupon = findCoupon(code);
  if (!coupon) httpError("Coupon not found.", 404);

  const input = normalizeCouponInput(body, { partial: true });
  const currentCode = normalizeCode(coupon.code);

  // Renaming onto an existing code would make lookups ambiguous.
  if (input.code && input.code !== currentCode && findCoupon(input.code)) {
    httpError(`Coupon "${input.code}" already exists.`, 409);
  }

  // Matches on the CURRENT code, so a rename in `input` lands correctly
  // (`code` is the primary key and Postgres allows updating it).
  assertPersisted(await updateCouponRow(currentCode, input), `Coupon "${currentCode}"`);

  Object.assign(coupon, input);
  return coupon;
}

/**
 * Deletes a coupon from the database, then from the cache.
 * @throws {Error} with `.status` 404 / 502
 */
export async function deleteCoupon(code) {
  const wanted = normalizeCode(code);
  const index = (siteData.coupons || []).findIndex((c) => normalizeCode(c.code) === wanted);
  if (index === -1) httpError("Coupon not found.", 404);

  assertPersisted(await deleteCouponRow(wanted), `Coupon "${wanted}"`);

  const [removed] = siteData.coupons.splice(index, 1);
  return removed;
}

/** The raw banner settings, including a code that may no longer be live. */
export function getFlashSaleForAdmin() {
  return siteData.flashSale;
}

/**
 * Validates + persists the flash sale banner, then updates the cache.
 * @throws {Error} with `.status` 400 / 502
 */
export async function updateFlashSale(body = {}) {
  const { active, headline, subtext, code, endsAt, ctaLabel, ctaHref } = body;

  if (endsAt !== undefined && endsAt && Number.isNaN(Date.parse(endsAt))) {
    httpError("endsAt must be a valid date.", 400);
  }
  // A banner advertising a code that does not exist is worse than no banner.
  if (code !== undefined && code && !findCoupon(code)) {
    httpError(`No coupon named "${normalizeCode(code)}" exists. Create it first.`, 400);
  }

  const next = { ...siteData.flashSale };
  if (active !== undefined) next.active = Boolean(active);
  if (headline !== undefined) next.headline = String(headline);
  if (subtext !== undefined) next.subtext = String(subtext);
  if (code !== undefined) next.code = normalizeCode(code);
  if (endsAt !== undefined) next.endsAt = endsAt || null;
  if (ctaLabel !== undefined) next.ctaLabel = String(ctaLabel);
  if (ctaHref !== undefined) next.ctaHref = String(ctaHref);

  assertPersisted(await saveFlashSale(next), "Flash sale banner");

  siteData.flashSale = next;
  return next;
}
