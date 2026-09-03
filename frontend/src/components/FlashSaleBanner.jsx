// ============================================================
// Flash Sale banner — site-wide promo strip with a live countdown.
//
// Content comes from `siteData.flashSale` (see GET /api/flash-sale).
// The banner hides itself automatically once `endsAt` passes, so an
// expired sale never stays on screen waiting for an admin edit.
//
// Dismissal state is owned by App.jsx because the Hero's top padding
// depends on whether this strip is occupying space.
// ============================================================

import { useEffect, useMemo, useState } from "react";

/** Milliseconds until `endsAt`, or null when there is no valid deadline. */
function msRemaining(endsAt) {
  if (!endsAt) return null;
  const target = Date.parse(endsAt);
  if (Number.isNaN(target)) return null;
  return target - Date.now();
}

function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}

function CountdownCell({ value, label }) {
  return (
    <div className="flex min-w-[2.75rem] flex-col items-center rounded-lg bg-black/20 px-2 py-1">
      <span className="font-display text-base font-bold leading-none tabular-nums sm:text-lg">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

export default function FlashSaleBanner({ sale, onDismiss }) {
  const endsAt = sale?.endsAt || null;
  const [remaining, setRemaining] = useState(() => msRemaining(endsAt));
  const [copied, setCopied] = useState(false);

  // Tick once a second, but only while there is a live deadline to show.
  useEffect(() => {
    setRemaining(msRemaining(endsAt));
    if (!endsAt) return undefined;
    const id = setInterval(() => setRemaining(msRemaining(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const parts = useMemo(() => (remaining == null ? null : splitDuration(remaining)), [remaining]);

  const copyCode = async () => {
    if (!sale?.code) return;
    try {
      await navigator.clipboard.writeText(sale.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is unavailable (older iOS Safari / no permission).
      // The code is displayed as text, so the user can still read and type it.
    }
  };

  if (!sale?.active) return null;
  // The deadline has passed — treat the sale as over.
  if (remaining != null && remaining <= 0) return null;

  return (
    <>
      {/* Clears the fixed header (6px flag stripe + 64px nav bar). Kept inside
          this component so it disappears together with the banner. */}
      <div className="h-[70px]" aria-hidden="true" />
      <section
        aria-label="Flash sale"
        className="relative bg-gradient-to-r from-german-red via-red-600 to-german-red text-white"
      >
        <div className="container-site flex flex-col items-center gap-3 py-3 pr-8 text-center sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
        {/* Message */}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-display text-sm font-bold sm:justify-start sm:text-base">
            <span aria-hidden="true">⚡</span>
            <span>{sale.headline}</span>
            {sale.discountLabel && (
              <span className="rounded-full bg-german-gold px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-german-black">
                {sale.discountLabel}
              </span>
            )}
          </p>
          {sale.subtext && <p className="mt-0.5 text-xs text-white/85 sm:text-[13px]">{sale.subtext}</p>}
        </div>

        {/* Countdown */}
        {parts && (
          <div className="flex shrink-0 items-center gap-1.5" role="timer" aria-live="off">
            {parts.days > 0 && <CountdownCell value={parts.days} label="days" />}
            <CountdownCell value={parts.hours} label="hrs" />
            <CountdownCell value={parts.minutes} label="min" />
            <CountdownCell value={parts.seconds} label="sec" />
          </div>
        )}

        {/* Code + CTA */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          {sale.code && (
            <button
              type="button"
              onClick={copyCode}
              title={`Copy coupon code ${sale.code}`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-dashed border-white/70 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wider transition hover:bg-white/20 active:scale-95"
            >
              <span aria-hidden="true">🎟</span>
              <span>{sale.code}</span>
              <span className="text-[10px] font-semibold opacity-80">{copied ? "COPIED!" : "TAP TO COPY"}</span>
            </button>
          )}
          {sale.ctaLabel && (
            <a
              href={sale.ctaHref || "#courses"}
              className="inline-flex min-h-[38px] items-center rounded-full bg-german-gold px-4 py-1.5 text-xs font-bold text-german-black shadow transition hover:brightness-95 active:scale-95"
            >
              {sale.ctaLabel}
            </a>
          )}
        </div>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss flash sale banner"
            className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white sm:right-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </section>
    </>
  );
}
