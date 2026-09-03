// ============================================================
// Coupon code input — shared by the Courses enroll modal and the
// Consultation booking form.
//
// The quote shown here is a PREVIEW from POST /api/coupons/validate.
// The backend independently recomputes the same discount when the
// Razorpay order is created, so this component is presentation only
// and cannot be used to lower a price.
// ============================================================

import { useEffect, useId, useRef, useState } from "react";
import api from "../api";

function formatRupees(amount) {
  return "₹" + Math.round(Number(amount) || 0).toLocaleString("en-IN");
}

/**
 * @param {object}   props
 * @param {number}   [props.courseId]   the course being bought
 * @param {number}   [props.sessionId]  the consultation session being booked
 * @param {string}   [props.suggestion] a code to pre-fill (e.g. the flash sale code)
 * @param {object[]} [props.available]  public coupons to offer as one-tap chips
 * @param {boolean}  [props.disabled]   locks the field while a payment is open
 * @param {function} props.onQuoteChange called with the applied quote, or null
 */
export default function CouponField({
  courseId,
  sessionId,
  suggestion = "",
  available = [],
  disabled = false,
  onQuoteChange
}) {
  const [code, setCode] = useState(suggestion || "");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  // The Courses modal and the booking form can be mounted at the same time,
  // so the input id has to be unique per instance.
  const inputId = useId();

  // `onQuoteChange` is usually an inline arrow, so keep it in a ref to avoid
  // re-running the reset effect on every parent render.
  const notifyRef = useRef(onQuoteChange);
  useEffect(() => {
    notifyRef.current = onQuoteChange;
  }, [onQuoteChange]);

  const itemKey = `${courseId ?? ""}:${sessionId ?? ""}`;

  // Switching item invalidates any applied discount — a course coupon must
  // not silently carry over to a consultation (or to a cheaper course).
  useEffect(() => {
    setQuote(null);
    setError("");
    setCode(suggestion || "");
    notifyRef.current?.(null);
  }, [itemKey, suggestion]);

  const apply = async (rawCode) => {
    const wanted = String(rawCode ?? code).trim();
    if (!wanted) {
      setError("Enter a coupon code first.");
      return;
    }
    if (courseId == null && sessionId == null) {
      setError("Choose what you're paying for first.");
      return;
    }

    setChecking(true);
    setError("");
    try {
      const result = await api.validateCoupon({
        code: wanted,
        ...(courseId != null ? { courseId } : {}),
        ...(sessionId != null ? { sessionId } : {})
      });

      if (result.valid) {
        setQuote(result);
        setCode(result.code);
        notifyRef.current?.(result);
      } else {
        setQuote(null);
        setError(result.reason || "That coupon could not be applied.");
        notifyRef.current?.(null);
      }
    } catch (err) {
      setQuote(null);
      setError(err.message);
      notifyRef.current?.(null);
    } finally {
      setChecking(false);
    }
  };

  const remove = () => {
    setQuote(null);
    setError("");
    setCode("");
    notifyRef.current?.(null);
  };

  // Only suggest coupons that are plausible for this item — the server is
  // still the authority, this just avoids offering obviously wrong chips.
  const scope = courseId != null ? "courses" : sessionId != null ? "consultation" : null;
  const chips = (available || []).filter(
    (c) => !scope || c.appliesTo === "all" || c.appliesTo === scope
  );

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3">
      {quote ? (
        // ---- Applied state ----
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true">🎟</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-green-700">
                  {quote.code} applied · {quote.label}
                </p>
                <p className="truncate text-xs text-slate-500">
                  You save {formatRupees(quote.discount)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={remove}
              disabled={disabled}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 underline transition hover:text-german-red disabled:opacity-50"
            >
              Remove
            </button>
          </div>

          <dl className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <dt>Price</dt>
              <dd className="line-through">{formatRupees(quote.baseAmount)}</dd>
            </div>
            <div className="flex justify-between text-green-700">
              <dt>Discount</dt>
              <dd>− {formatRupees(quote.discount)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-display text-base font-bold text-slate-900">
              <dt>You pay</dt>
              <dd className="text-german-red">{formatRupees(quote.finalAmount)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        // ---- Entry state ----
        <div>
          <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Have a coupon?
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={inputId}
              className="input-field !py-2.5 font-mono !text-sm uppercase tracking-wider"
              placeholder="ENTER CODE"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              disabled={disabled || checking}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
              onKeyDown={(e) => {
                // Inside a <form>, Enter would submit and open Razorpay.
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
              }}
            />
            <button
              type="button"
              onClick={() => apply()}
              disabled={disabled || checking || !code.trim()}
              className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
            >
              {checking ? "…" : "Apply"}
            </button>
          </div>

          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => apply(c.code)}
                  disabled={disabled || checking}
                  title={c.description}
                  className="rounded-full border border-german-gold bg-german-gold/15 px-2.5 py-1 text-[11px] font-bold text-yellow-800 transition hover:bg-german-gold/30 disabled:opacity-50"
                >
                  {c.code} · {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
