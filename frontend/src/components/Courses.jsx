// ============================================================
// Courses section — public course cards.
// Enrolling requires PAYMENT (Razorpay: UPI/GPay/PhonePe/QR/
// cards/netbanking). Signed-in ADMINS get ✏️ Edit / 🗑 Delete.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { payWithRazorpay } from "../razorpay";
import CouponField from "./CouponField";

// "₹9,999" → 9999
function priceToNumber(price) {
  const n = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatRupees(amount) {
  return "₹" + Math.round(Number(amount) || 0).toLocaleString("en-IN");
}

export default function Courses({ courses, coupons = [], flashSale, onContentChanged }) {
  const { isAdmin, user, isGuest } = useAuth();
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Course ids the signed-in student already owns — those cards show an
  // "Enrolled ✓" state instead of the Enroll & Pay button.
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const isStudentSession = Boolean(user?.email) && !isGuest && !isAdmin;

  const loadMyEnrollments = useCallback(async () => {
    if (!isStudentSession) {
      setEnrolledIds(new Set());
      return;
    }
    try {
      const data = await api.learning.myEnrollments();
      setEnrolledIds(new Set((data.courseIds || []).map(Number)));
    } catch {
      // Soft-fail: cards simply keep the enroll button.
      setEnrolledIds(new Set());
    }
  }, [isStudentSession]);

  useEffect(() => {
    loadMyEnrollments();
  }, [loadMyEnrollments]);

  // Enrollment/payment modal
  const [enrollCourse, setEnrollCourse] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ name: "", email: "", phone: "" });
  const [enrollStatus, setEnrollStatus] = useState({ type: "", message: "" });
  const [paying, setPaying] = useState(false);
  // Verified coupon preview for the course in the modal (null = no discount).
  const [couponQuote, setCouponQuote] = useState(null);

  if (!courses?.length) return null;

  const startEdit = (course) => {
    setError("");
    setEditing({
      ...course,
      features: Array.isArray(course.features) ? course.features.join(", ") : course.features || "",
      externalLink: course.externalLink || ""
    });
  };

  const saveEdit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.admin.updateCourse(editing.id, {
        level: editing.level || "NEW",
        title: editing.title,
        description: editing.description,
        duration: editing.duration,
        mode: editing.mode,
        price: editing.price,
        features: editing.features.split(",").map((f) => f.trim()).filter(Boolean),
        externalLink: editing.externalLink || ""
      });
      setEditing(null);
      onContentChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (course) => {
    if (!window.confirm(`Delete course "${course.title}"?`)) return;
    setBusy(true);
    try {
      await api.admin.deleteCourse(course.id);
      onContentChanged?.();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Send guests to the login page — enrolling requires a student account so
  // the purchase is tied to their login and they can access the course.
  const requireSignIn = () => {
    sessionStorage.removeItem("gt_entered_site");
    window.location.reload();
  };

  const openEnroll = (course) => {
    setEnrollCourse(course);
    setEnrollStatus({ type: "", message: "" });
    setCouponQuote(null);
    setEnrollForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "" });
  };

  const handleEnrollPay = async (e) => {
    e.preventDefault();
    const listPrice = priceToNumber(enrollCourse.price);
    if (listPrice < 1) {
      setEnrollStatus({ type: "error", message: "This course has no payable price set." });
      return;
    }
    // Display hint only — the backend recomputes this from the course id
    // and re-validates the coupon before charging.
    const amount = couponQuote?.finalAmount ?? listPrice;

    setPaying(true);
    setEnrollStatus({ type: "", message: "" });
    try {
      const result = await payWithRazorpay({
        amount,
        name: enrollForm.name,
        email: enrollForm.email,
        phone: enrollForm.phone,
        sessionName: `Course: ${enrollCourse.title}`,
        description: `${enrollCourse.level} · ${enrollCourse.title}`,
        courseId: enrollCourse.id,
        couponCode: couponQuote?.code,
        // Transient hint on a failed attempt; the user can retry in the modal.
        onFailure: (err) =>
          setEnrollStatus({
            type: "error",
            message: "⚠️ " + err.message + " No money deducted — you can retry."
          })
      });
      if (result.success) {
        // A successful retry overrides any earlier "failed" message.
        const savedNote = result.discount > 0 ? ` You saved ${formatRupees(result.discount)}.` : "";
        setEnrollStatus({
          type: "success",
          message: `🎉 Payment successful! You're enrolled in ${enrollCourse.title}.${savedNote} A confirmation has been emailed to you.`
        });
        // Flip the card to its "Enrolled ✓" state right away.
        if (isStudentSession && String(enrollForm.email).toLowerCase() === String(user.email).toLowerCase()) {
          setEnrolledIds((prev) => new Set([...prev, Number(enrollCourse.id)]));
        }
        loadMyEnrollments();
        // Tell "My Learning" the student owns a new course so it refreshes
        // instantly (no page reload needed).
        window.dispatchEvent(new CustomEvent("gt:enrolled", { detail: { courseId: enrollCourse.id } }));
        setTimeout(() => setEnrollCourse(null), 3500);
      } else if (result.dismissed) {
        setEnrollStatus({ type: "error", message: "Payment cancelled. Enrollment not completed." });
      } else {
        setEnrollStatus({
          type: "error",
          message: "Payment failed: " + (result.error || "Unknown error") + " — no money deducted."
        });
      }
    } catch (err) {
      setEnrollStatus({ type: "error", message: err.message });
    } finally {
      setPaying(false);
    }
  };

  return (
    <section id="courses" className="bg-slate-50 py-20">
      <div className="container-site">
        <h2 className="section-title">
          German <span>Courses</span>
        </h2>
        <p className="section-subtitle">
          Structured programs from complete beginner to advanced — enroll instantly with secure payment (UPI, GPay,
          PhonePe, cards & net banking).
        </p>

        {/* Flash sale reminder — the exact discount is verified at checkout */}
        {flashSale?.active && flashSale.code && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl bg-german-gold/20 px-4 py-2.5 text-sm font-semibold text-yellow-900">
            <span aria-hidden="true">⚡</span>
            <span>{flashSale.discountLabel || "Sale on now"} — use code</span>
            <span className="rounded-md border border-dashed border-yellow-700/40 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-wider">
              {flashSale.code}
            </span>
            <span className="font-normal text-yellow-800">at checkout</span>
          </p>
        )}

        <div className="mt-12 grid gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            // `id` lets other sections deep-link straight to a course card
            // (the Spoken German section CTA uses #course-7).
            <div key={course.id} id={`course-${course.id}`} className="card relative flex flex-col scroll-mt-28">
              {isAdmin && editing?.id !== course.id && (
                <div className="absolute -right-2 -top-2 z-10 flex gap-1.5">
                  <button type="button" title={`Edit ${course.title}`} onClick={() => startEdit(course)} className="flex h-8 w-8 items-center justify-center rounded-full bg-german-gold text-slate-900 shadow-lg transition hover:scale-110">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                    </svg>
                  </button>
                  <button type="button" title={`Delete ${course.title}`} disabled={busy} onClick={() => removeCourse(course)} className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110 disabled:opacity-50">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              )}

              {isAdmin && editing?.id === course.id ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-german-red">✏️ Edit Course</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input-field !py-2 text-xs" placeholder="Level (e.g. A1)" value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value })} />
                    <input className="input-field !py-2 text-xs" placeholder="Price (e.g. ₹9,999)" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                  </div>
                  <input className="input-field !py-2 text-xs" placeholder="Course title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  <textarea className="input-field !py-2 text-xs" rows="3" placeholder="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input-field !py-2 text-xs" placeholder="Duration" value={editing.duration} onChange={(e) => setEditing({ ...editing, duration: e.target.value })} />
                    <input className="input-field !py-2 text-xs" placeholder="Mode" value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value })} />
                  </div>
                  <textarea className="input-field !py-2 text-xs" rows="2" placeholder="Features (comma-separated)" value={editing.features} onChange={(e) => setEditing({ ...editing, features: e.target.value })} />
                  <input className="input-field !py-2 text-xs" placeholder="External link (optional)" value={editing.externalLink} onChange={(e) => setEditing({ ...editing, externalLink: e.target.value })} />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={saveEdit} disabled={busy} className="btn btn-gold flex-1 !py-2 text-xs disabled:opacity-60">
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-full bg-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-300">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <span className="badge badge-level">{course.level}</span>
                    <span className="font-display text-2xl font-bold text-german-red">{course.price}</span>
                  </div>

                  <h3 className="mt-4 font-display text-xl font-bold">{course.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{course.description}</p>

                  <div className="mt-4 space-y-1 text-xs text-slate-500">
                    <p>⏱ {course.duration}</p>
                    <p>💻 {course.mode}</p>
                  </div>

                  <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                    {course.features?.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                        <span className="text-german-red">✓</span> {f}
                      </li>
                    ))}
                  </ul>

                  {enrolledIds.has(Number(course.id)) ? (
                    <div className="mt-6">
                      <p className="flex items-center justify-center gap-2 rounded-full bg-green-100 py-2.5 text-sm font-bold text-green-700">
                        ✅ Enrolled — you have full access
                      </p>
                      <a href="#my-learning" className="btn btn-primary mt-2 w-full !py-2.5 text-sm">
                        📖 Go to course
                      </a>
                    </div>
                  ) : isStudentSession || isAdmin ? (
                    <button onClick={() => openEnroll(course)} className="btn btn-primary mt-6 w-full !py-2.5 text-sm">
                      💳 Enroll & Pay {course.price}
                    </button>
                  ) : (
                    // Guests / signed-out visitors must create a student account
                    // first, so every enrollment is tied to a real login and the
                    // student can always see their status and access the course.
                    <div className="mt-6">
                      <button onClick={requireSignIn} className="btn btn-primary w-full !py-2.5 text-sm">
                        🔐 Sign in to Enroll — {course.price}
                      </button>
                      <p className="mt-2 text-center text-xs text-slate-400">
                        Create a free student account (or log in) to enroll and track your learning.
                      </p>
                    </div>
                  )}
                  {course.externalLink && (
                    <a href={course.externalLink} target="_blank" rel="noreferrer" className="mt-2 text-center text-xs text-slate-400 underline hover:text-german-red">
                      More details / syllabus
                    </a>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Enroll & Pay modal */}
      {enrollCourse && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => !paying && setEnrollCourse(null)}
        >
          {/* On phones this becomes a bottom sheet that can scroll and clears the
              iOS home indicator; on larger screens it is a centred dialog. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Enroll in ${enrollCourse.title}`}
            className="my-auto w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-8 sm:pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-bold sm:text-xl">Enroll in {enrollCourse.level}</h3>
              <button
                onClick={() => !paying && setEnrollCourse(null)}
                aria-label="Close"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">{enrollCourse.title}</p>

            {/* Price — struck through once a coupon is applied */}
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <p
                className={`font-display font-extrabold ${
                  couponQuote ? "text-xl text-slate-400 line-through" : "text-3xl text-german-red"
                }`}
              >
                {enrollCourse.price}
              </p>
              {couponQuote && (
                <>
                  <p className="font-display text-3xl font-extrabold text-german-red">
                    {formatRupees(couponQuote.finalAmount)}
                  </p>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">
                    SAVING {formatRupees(couponQuote.discount)}
                  </span>
                </>
              )}
            </div>

            <form onSubmit={handleEnrollPay} className="mt-5 grid gap-3">
              <input className="input-field" placeholder="Your name *" autoComplete="name" value={enrollForm.name} onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })} required />
              <input className="input-field" type="email" inputMode="email" autoComplete="email" placeholder="Your email *" value={enrollForm.email} onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })} required />
              <input className="input-field" type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone / WhatsApp *" value={enrollForm.phone} onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })} required />

              <CouponField
                courseId={enrollCourse.id}
                suggestion={flashSale?.code || ""}
                available={coupons}
                disabled={paying}
                onQuoteChange={setCouponQuote}
              />

              <button type="submit" disabled={paying} className="btn btn-primary disabled:opacity-60">
                {paying
                  ? "Opening payment…"
                  : `Pay ${couponQuote ? formatRupees(couponQuote.finalAmount) : enrollCourse.price} & Enroll`}
              </button>
              <p className="text-center text-xs text-slate-400">
                🔒 UPI (GPay / PhonePe / BHIM / Paytm / QR), cards & net banking via Razorpay.
              </p>
              {enrollStatus.message && (
                <p className={`rounded-xl p-3 text-sm ${enrollStatus.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {enrollStatus.message}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
