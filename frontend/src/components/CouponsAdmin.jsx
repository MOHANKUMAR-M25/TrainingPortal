// ============================================================
// Coupons & Flash Sale admin — rendered inside AdminPanel's
// "Coupons & Sale" tab (admins only).
//
// Talks to /api/admin/coupons and /api/admin/flash-sale. The
// server re-validates everything (see backend/coupons.js), so
// this form is a convenience layer, not the safety net: bad
// input comes back as a 400 and is shown inline.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";

const EMPTY_COUPON = {
  code: "",
  type: "percent",
  value: "",
  description: "",
  appliesTo: "all",
  courseIds: [],
  minAmount: "",
  maxDiscount: "",
  expiresAt: "",
  usageLimit: "",
  active: true,
  hidden: false
};

// ---------- date helpers ----------
// siteData stores ISO strings with an offset; <input type="datetime-local">
// wants a bare local "YYYY-MM-DDTHH:mm".

function toLocalInputValue(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  // Shift by the local offset so toISOString() yields local wall-clock time.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromLocalInputValue(local) {
  if (!local) return null;
  const t = Date.parse(local); // no offset => parsed as local time
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function formatDate(iso) {
  if (!iso) return "no expiry";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "no expiry";
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Turns a form's string inputs into the API payload.
function toPayload(form) {
  return {
    code: form.code,
    type: form.type,
    value: Number(form.value),
    description: form.description || "",
    appliesTo: form.appliesTo || "all",
    // Only a course-scoped coupon can have a course whitelist.
    courseIds: form.appliesTo === "courses" ? form.courseIds || [] : [],
    minAmount: form.minAmount === "" ? 0 : Number(form.minAmount),
    // A cap only means anything for a percentage discount.
    maxDiscount: form.type === "percent" && form.maxDiscount !== "" ? Number(form.maxDiscount) : null,
    expiresAt: fromLocalInputValue(form.expiresAt),
    usageLimit: form.usageLimit === "" ? null : Number(form.usageLimit),
    active: Boolean(form.active),
    hidden: Boolean(form.hidden)
  };
}

// Turns an API coupon into form state.
function toForm(coupon) {
  return {
    code: coupon.code || "",
    type: coupon.type || "percent",
    value: String(coupon.value ?? ""),
    description: coupon.description || "",
    appliesTo: coupon.appliesTo || "all",
    courseIds: Array.isArray(coupon.courseIds) ? coupon.courseIds : [],
    minAmount: coupon.minAmount ? String(coupon.minAmount) : "",
    maxDiscount: coupon.maxDiscount == null ? "" : String(coupon.maxDiscount),
    expiresAt: toLocalInputValue(coupon.expiresAt),
    usageLimit: coupon.usageLimit == null ? "" : String(coupon.usageLimit),
    active: coupon.active !== false,
    hidden: Boolean(coupon.hidden)
  };
}

/** Shared field set for both the "new" and "edit" forms. */
function CouponFields({ form, setForm, courses, idPrefix, compact = false }) {
  const size = compact ? "!py-2 text-xs" : "";
  const toggleCourse = (id) =>
    setForm({
      ...form,
      courseIds: form.courseIds.includes(id)
        ? form.courseIds.filter((x) => x !== id)
        : [...form.courseIds, id]
    });

  return (
    <>
      <input
        className={`input-field font-mono uppercase tracking-wider ${size}`}
        placeholder="CODE * (e.g. GERMAN25)"
        value={form.code}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck="false"
        onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        required
      />

      <div className="flex gap-2">
        <select
          className={`input-field ${size}`}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="percent">% off</option>
          <option value="flat">₹ off</option>
        </select>
        <input
          className={`input-field ${size}`}
          type="number"
          inputMode="numeric"
          min="1"
          max={form.type === "percent" ? "100" : undefined}
          placeholder={form.type === "percent" ? "25" : "500"}
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          required
        />
      </div>

      <input
        className={`input-field sm:col-span-2 ${size}`}
        placeholder="Description shown to students (e.g. 25% off any German course)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      <select
        className={`input-field ${size}`}
        value={form.appliesTo}
        onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}
      >
        <option value="all">Valid on everything</option>
        <option value="courses">Courses only</option>
        <option value="consultation">Consultations only</option>
      </select>

      <input
        className={`input-field ${size}`}
        type="number"
        inputMode="numeric"
        min="0"
        placeholder="Minimum order ₹ (blank = none)"
        value={form.minAmount}
        onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
      />

      {/* A cap is meaningless on a flat discount. */}
      {form.type === "percent" && (
        <input
          className={`input-field ${size}`}
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Max discount ₹ (blank = uncapped)"
          value={form.maxDiscount}
          onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
        />
      )}

      <input
        className={`input-field ${size}`}
        type="number"
        inputMode="numeric"
        min="1"
        placeholder="Redemption limit (blank = unlimited)"
        value={form.usageLimit}
        onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
      />

      <div className={form.type === "percent" ? "" : "sm:col-span-2"}>
        <label htmlFor={`${idPrefix}-expires`} className="mb-1 block text-xs font-semibold text-slate-400">
          Expires (blank = never)
        </label>
        <input
          id={`${idPrefix}-expires`}
          className={`input-field ${size}`}
          type="datetime-local"
          value={form.expiresAt}
          onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
        />
      </div>

      {/* Course whitelist — only relevant for course-scoped coupons. */}
      {form.appliesTo === "courses" && (
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-semibold text-slate-400">
            Limit to specific courses (none selected = every course)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {courses.map((c) => {
              const on = form.courseIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCourse(c.id)}
                  title={c.title}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "bg-german-gold text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {c.level} · {c.title.length > 26 ? c.title.slice(0, 26) + "…" : c.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-german-gold"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-german-gold"
            checked={form.hidden}
            onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
          />
          Private — never advertised, only works if typed
        </label>
      </div>
    </>
  );
}

export default function CouponsAdmin({ courses = [], onContentChanged }) {
  const [coupons, setCoupons] = useState([]);
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [newCoupon, setNewCoupon] = useState(EMPTY_COUPON);
  const [showNew, setShowNew] = useState(false);
  const [editingCode, setEditingCode] = useState(null); // the ORIGINAL code being edited
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async () => {
    const [couponRes, saleRes] = await Promise.all([api.admin.getCoupons(), api.admin.getFlashSale()]);
    const list = couponRes.coupons || [];
    const loadedSale = saleRes.flashSale || null;

    setCoupons(list);
    // If the advertised code was deleted, drop the reference. Otherwise the
    // <select> would show "none" while state still held the dead code, and
    // saving would fail with "No coupon named X exists".
    setSale(
      loadedSale && loadedSale.code && !list.some((c) => c.code === loadedSale.code)
        ? { ...loadedSale, code: "" }
        : loadedSale
    );
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setStatus({ type: "error", message: err.message }))
      .finally(() => setLoading(false));
  }, [load]);

  // Runs an action, reloads, and refreshes the public site so the banner and
  // coupon chips reflect the change immediately.
  const run = async (fn, successMsg) => {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await fn();
      await load();
      setStatus({ type: "success", message: successMsg });
      onContentChanged?.();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading coupons…</p>;

  return (
    <div className="space-y-8">
      {/* ============ Flash sale banner ============ */}
      <div className="rounded-xl bg-slate-900/60 p-5">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
          ⚡ Flash Sale Banner
        </h3>
        <p className="mt-2 text-xs text-slate-400">
          Shows as a strip at the top of the site with a live countdown. It hides itself automatically once the
          end date passes — you don't need to switch it off.
        </p>

        {sale && (
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  api.admin.updateFlashSale({
                    active: sale.active,
                    headline: sale.headline || "",
                    subtext: sale.subtext || "",
                    code: sale.code || "",
                    // Already an ISO string — the datetime-local input converts
                    // on change, so no round-trip is needed here.
                    endsAt: sale.endsAt || null,
                    ctaLabel: sale.ctaLabel || "",
                    ctaHref: sale.ctaHref || "#courses"
                  }),
                sale.active ? "✅ Flash sale banner updated and live." : "✅ Flash sale banner saved (currently off)."
              );
            }}
          >
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-german-gold"
                checked={Boolean(sale.active)}
                onChange={(e) => setSale({ ...sale, active: e.target.checked })}
              />
              Show the banner on the website
            </label>

            <input
              className="input-field sm:col-span-2"
              placeholder="Headline * (e.g. Autumn Flash Sale — 25% OFF all courses)"
              value={sale.headline || ""}
              onChange={(e) => setSale({ ...sale, headline: e.target.value })}
              required
            />
            <input
              className="input-field sm:col-span-2"
              placeholder="Sub-text (e.g. Limited seats per batch)"
              value={sale.subtext || ""}
              onChange={(e) => setSale({ ...sale, subtext: e.target.value })}
            />

            <div>
              <label htmlFor="sale-code" className="mb-1 block text-xs font-semibold text-slate-400">
                Coupon code to advertise
              </label>
              {/* A select, not a text box: the API rejects a banner pointing at
                  a code that doesn't exist. */}
              <select
                id="sale-code"
                className="input-field"
                value={sale.code || ""}
                onChange={(e) => setSale({ ...sale, code: e.target.value })}
              >
                <option value="">— none —</option>
                {coupons.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.label}){c.hidden ? " · private" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sale-ends" className="mb-1 block text-xs font-semibold text-slate-400">
                Countdown ends
              </label>
              <input
                id="sale-ends"
                className="input-field"
                type="datetime-local"
                value={toLocalInputValue(sale.endsAt)}
                onChange={(e) => setSale({ ...sale, endsAt: fromLocalInputValue(e.target.value) })}
              />
            </div>

            <input
              className="input-field"
              placeholder="Button label (e.g. Browse courses)"
              value={sale.ctaLabel || ""}
              onChange={(e) => setSale({ ...sale, ctaLabel: e.target.value })}
            />
            <input
              className="input-field"
              placeholder="Button link (e.g. #courses)"
              value={sale.ctaHref || ""}
              onChange={(e) => setSale({ ...sale, ctaHref: e.target.value })}
            />

            {sale.code && !coupons.some((c) => c.code === sale.code && c.live) && (
              <p className="rounded-xl bg-yellow-500/10 p-3 text-xs text-yellow-400 sm:col-span-2">
                ⚠️ <b>{sale.code}</b> is not currently live (inactive, expired or fully redeemed). The banner will
                show without a code until you reactivate it below.
              </p>
            )}

            <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
              {busy ? "Saving…" : "Save Banner"}
            </button>
          </form>
        )}
      </div>

      {/* ============ Coupon list ============ */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
            🎟 Coupon Codes ({coupons.length})
          </h3>
          <button
            type="button"
            onClick={() => {
              setShowNew((v) => !v);
              setEditingCode(null);
              setStatus({ type: "", message: "" });
            }}
            className="rounded-full bg-german-gold px-4 py-2 text-xs font-bold text-slate-900 hover:opacity-90"
          >
            {showNew ? "✕ Cancel" : "+ New Coupon"}
          </button>
        </div>

        {/* ---- Create ---- */}
        {showNew && (
          <form
            className="mt-4 grid gap-4 rounded-xl bg-slate-900/60 p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.admin.addCoupon(toPayload(newCoupon));
                setNewCoupon(EMPTY_COUPON);
                setShowNew(false);
              }, `✅ Coupon ${newCoupon.code.toUpperCase()} created.`);
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
              New coupon
            </p>
            <CouponFields form={newCoupon} setForm={setNewCoupon} courses={courses} idPrefix="new" />
            <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy || !newCoupon.code || !newCoupon.value}>
              {busy ? "Creating…" : "Create Coupon"}
            </button>
          </form>
        )}

        {/* ---- List ---- */}
        <div className="mt-4 space-y-3">
          {coupons.length === 0 && (
            <p className="rounded-xl bg-slate-900/60 p-5 text-sm text-slate-400">
              No coupons yet. Use <b>+ New Coupon</b> to create your first discount code.
            </p>
          )}

          {coupons.map((c) => (
            <div key={c.code} className="rounded-xl bg-slate-900/60 p-4">
              {editingCode === c.code ? (
                // ---- Edit ----
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api.admin.updateCoupon(c.code, toPayload(editForm));
                      setEditingCode(null);
                      setEditForm(null);
                    }, `✅ Coupon ${c.code} updated.`);
                  }}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
                    Editing {c.code}
                  </p>
                  <CouponFields
                    form={editForm}
                    setForm={setEditForm}
                    courses={courses}
                    idPrefix={`edit-${c.code}`}
                    compact
                  />
                  <div className="flex gap-2 sm:col-span-2">
                    <button className="btn btn-gold flex-1 !py-2 text-xs disabled:opacity-60" disabled={busy}>
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-slate-700 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-600"
                      onClick={() => {
                        setEditingCode(null);
                        setEditForm(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                // ---- Summary row ----
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                      <span className="rounded border border-dashed border-german-gold/50 bg-german-gold/10 px-2 py-0.5 font-mono text-xs tracking-wider text-german-gold">
                        {c.code}
                      </span>
                      <span>{c.label}</span>
                      {c.live ? (
                        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-green-400">
                          Live
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-red-400">
                          {c.active === false ? "Off" : "Expired / used up"}
                        </span>
                      )}
                      {c.hidden && (
                        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                          Private
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {c.appliesTo === "all"
                        ? "Everything"
                        : c.appliesTo === "courses"
                        ? c.courseIds?.length
                          ? `Courses: ${c.courseIds
                              .map((id) => courses.find((x) => x.id === id)?.level || id)
                              .join(", ")}`
                          : "All courses"
                        : "Consultations"}
                      {c.minAmount ? ` · min ₹${Number(c.minAmount).toLocaleString("en-IN")}` : ""}
                      {c.maxDiscount != null ? ` · cap ₹${Number(c.maxDiscount).toLocaleString("en-IN")}` : ""}
                      {` · ${formatDate(c.expiresAt)}`}
                      {` · used ${c.usedCount || 0}${c.usageLimit != null ? `/${c.usageLimit}` : ""}`}
                    </p>
                    {c.description && <p className="mt-1 text-xs italic text-slate-500">{c.description}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-slate-700 px-4 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-600 disabled:opacity-60"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api.admin.updateCoupon(c.code, { active: c.active === false }),
                          c.active === false ? `✅ ${c.code} activated.` : `⏸ ${c.code} switched off.`
                        )
                      }
                    >
                      {c.active === false ? "▶ Activate" : "⏸ Switch off"}
                    </button>
                    <button
                      className="rounded-full bg-german-gold px-4 py-1.5 text-xs font-bold text-slate-900 hover:opacity-90"
                      onClick={() => {
                        setEditingCode(c.code);
                        setEditForm(toForm(c));
                        setShowNew(false);
                        setStatus({ type: "", message: "" });
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => {
                        const warning =
                          sale?.code === c.code
                            ? `"${c.code}" is the code advertised on the flash sale banner. Delete it anyway?`
                            : `Delete coupon "${c.code}"?`;
                        if (window.confirm(warning)) {
                          run(() => api.admin.deleteCoupon(c.code), `🗑️ Coupon ${c.code} deleted.`);
                        }
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {status.message && (
        <p
          className={`rounded-xl p-4 text-sm ${
            status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
