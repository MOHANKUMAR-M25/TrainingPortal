// ============================================================
// Calendar slot booking — students pick a free slot from
// Meenu's Google Calendar, PAY via Razorpay (INR), then book.
// Every step is tracked in Supabase:
//   attempt → (abandon | paid → booked | payment_failed)
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { getSessionId } from "../session";
import { payWithRazorpay } from "../razorpay";

function formatDay(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
// "₹2,299" → 2299
function priceToNumber(price) {
  const n = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function CalendarBooking({ consultation }) {
  const { user } = useAuth();
  const [slotData, setSlotData] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotError, setSlotError] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", sessionId: "", notes: "" });
  const [status, setStatus] = useState({ type: "", message: "", meetLink: null });
  const [submitting, setSubmitting] = useState(false);
  const bookingIdRef = useRef(null);
  const paidRef = useRef(false);

  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.name || "",
        email: prev.email || user.email || "",
        phone: prev.phone || user.phone || ""
      }));
    }
  }, [user]);

  const loadSlots = () => {
    setLoadingSlots(true);
    api.getSlots().then(setSlotData).catch((err) => setSlotError(err.message)).finally(() => setLoadingSlots(false));
  };
  useEffect(loadSlots, []);

  // If the student started a booking (attempt row exists) but left without
  // paying, mark it abandoned ("tried but didn't book").
  useEffect(() => {
    return () => {
      if (bookingIdRef.current && !paidRef.current) {
        api.bookingAbandon({ bookingId: bookingIdRef.current });
      }
    };
  }, []);

  const slotsByDay = useMemo(() => {
    const map = {};
    (slotData?.slots || []).forEach((s) => {
      const day = new Date(s.start).toDateString();
      (map[day] ||= []).push(s);
    });
    return map;
  }, [slotData]);

  const days = Object.keys(slotsByDay);
  useEffect(() => {
    if (days.length && !selectedDay) setSelectedDay(days[0]);
  }, [days, selectedDay]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const selectedSession = consultation?.sessions?.find((s) => String(s.id) === String(form.sessionId));
  const amount = priceToNumber(selectedSession?.price);
  const sessionLabel = selectedSession ? `${selectedSession.name} (${selectedSession.price})` : "Consultation";

  const finalizeBooking = async () => {
    const res = await api.bookSlot({ start: selectedSlot.start, end: selectedSlot.end, ...form });
    setStatus({ type: "success", message: "✅ Payment received & slot booked! " + res.message, meetLink: res.meetLink });
    setForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "", sessionId: "", notes: "" });
    setSelectedSlot(null);
    bookingIdRef.current = null;
    loadSlots();
  };

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setStatus({ type: "error", message: "Please select a time slot first.", meetLink: null });
      return;
    }
    if (!selectedSession) {
      setStatus({ type: "error", message: "Please choose a session type.", meetLink: null });
      return;
    }
    setSubmitting(true);
    setStatus({ type: "", message: "", meetLink: null });
    paidRef.current = false;

    try {
      // 1) Record an "attempted" booking
      const attempt = await api.bookingAttempt({
        name: form.name,
        email: form.email,
        phone: form.phone,
        sessionId: Number(form.sessionId),
        sessionName: sessionLabel,
        amount,
        slotStart: selectedSlot.start,
        slotEnd: selectedSlot.end,
        notes: form.notes
      });
      bookingIdRef.current = attempt.bookingId;

      // 2) Pay via Razorpay (INR)
      const payResult = await payWithRazorpay({
        amount,
        name: form.name,
        email: form.email,
        phone: form.phone,
        sessionName: sessionLabel,
        bookingId: attempt.bookingId,
        description: `${selectedSession.name} · ${formatDay(selectedSlot.start)} ${formatTime(selectedSlot.start)}`,
        // While the modal is open, a failed attempt shows a transient hint but
        // the user can retry; final status is decided after the modal closes.
        onFailure: (err) =>
          setStatus({
            type: "error",
            message: "⚠️ " + err.message + " No money deducted — you can retry above.",
            meetLink: null
          })
      });

      // 3) On verified success → create the calendar booking.
      // (A successful retry overrides any earlier "failed" message.)
      if (payResult.success) {
        paidRef.current = true;
        await finalizeBooking();
      } else if (!payResult.dismissed) {
        setStatus({
          type: "error",
          message: "Payment failed: " + (payResult.error || "Unknown error") + " — no money deducted.",
          meetLink: null
        });
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message, meetLink: null });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="booking-form" className="mt-14 scroll-mt-24">
      <div className="card !p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold">📅 Book & Pay for a Slot on Meenu's Calendar</h3>
            <p className="mt-1 text-sm text-slate-500">{consultation?.bookingNote}</p>
          </div>
          <span className={`badge ${slotData?.connected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>
            {slotData?.connected ? "● Live Google Calendar" : "● Standard availability"}
          </span>
        </div>

        {slotData && !slotData.connected && (
          <p className="mt-3 rounded-xl bg-yellow-50 p-3 text-xs text-yellow-800">{slotData.note}</p>
        )}

        {loadingSlots ? (
          <p className="mt-6 text-sm text-slate-500">Loading available slots…</p>
        ) : slotError ? (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{slotError}</p>
        ) : (
          <>
            <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedDay === day ? "bg-german-red text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {formatDay(slotsByDay[day][0].start)}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {(slotsByDay[selectedDay] || []).map((slot) => {
                const isSelected = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                      isSelected
                        ? "border-german-red bg-german-red text-white shadow"
                        : "border-slate-200 bg-white text-slate-700 hover:border-german-red hover:text-german-red"
                    }`}
                  >
                    {formatTime(slot.start)}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <form onSubmit={handleBook} className="mt-8 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
          {selectedSlot && (
            <p className="rounded-xl bg-german-gold/15 p-3 text-sm font-semibold text-slate-800 sm:col-span-2">
              Selected: {formatDay(selectedSlot.start)} · {formatTime(selectedSlot.start)} – {formatTime(selectedSlot.end)}
            </p>
          )}
          {user && (
            <p className="rounded-xl bg-green-50 p-3 text-xs text-green-700 sm:col-span-2">
              ✅ Booking as <span className="font-bold">{user.name || user.email}</span> — details filled in automatically.
            </p>
          )}
          <input className="input-field" name="name" placeholder="Your name *" value={form.name} onChange={handleChange} required />
          <input className="input-field" name="email" type="email" placeholder="Your email * (invite is sent here)" value={form.email} onChange={handleChange} required />
          <input className="input-field" name="phone" placeholder="Phone / WhatsApp" value={form.phone} onChange={handleChange} />
          <select className="input-field" name="sessionId" value={form.sessionId} onChange={handleChange} required>
            <option value="">Choose session type *</option>
            {consultation?.sessions?.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.duration} ({s.price})</option>
            ))}
          </select>
          <textarea className="input-field sm:col-span-2" name="notes" rows="3" placeholder="Anything Meenu should know? (optional)" value={form.notes} onChange={handleChange} />
          <button type="submit" disabled={submitting || !selectedSlot} className="btn btn-primary sm:col-span-2 disabled:opacity-60">
            {submitting
              ? "Processing…"
              : selectedSlot && selectedSession
              ? `Pay ${selectedSession.price} & Book`
              : "Select a slot & session to book"}
          </button>
          <p className="text-center text-xs text-slate-400 sm:col-span-2">
            🔒 Secure payment via Razorpay — UPI, GPay, cards & net banking.
          </p>
        </form>

        {status.message && (
          <div className={`mt-4 rounded-xl p-4 text-sm ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {status.message}
            {status.meetLink && (
              <a href={status.meetLink} target="_blank" rel="noreferrer" className="ml-2 font-bold underline">
                Join Google Meet link
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
