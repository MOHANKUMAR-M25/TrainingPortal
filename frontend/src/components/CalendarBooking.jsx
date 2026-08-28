// ============================================================
// Calendar slot booking — students pick a free slot from
// Meenu's Google Calendar and book by giving contact details.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import api from "../api";

function formatDay(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function CalendarBooking({ consultation }) {
  const [slotData, setSlotData] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [slotError, setSlotError] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", sessionId: "", notes: "" });
  const [status, setStatus] = useState({ type: "", message: "", meetLink: null });
  const [submitting, setSubmitting] = useState(false);

  const loadSlots = () => {
    setLoadingSlots(true);
    api
      .getSlots()
      .then(setSlotData)
      .catch((err) => setSlotError(err.message))
      .finally(() => setLoadingSlots(false));
  };

  useEffect(loadSlots, []);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const map = {};
    (slotData?.slots || []).forEach((s) => {
      const day = new Date(s.start).toDateString();
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });
    return map;
  }, [slotData]);

  const days = Object.keys(slotsByDay);

  useEffect(() => {
    if (days.length && !selectedDay) setSelectedDay(days[0]);
  }, [days, selectedDay]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setStatus({ type: "error", message: "Please select a time slot first.", meetLink: null });
      return;
    }
    setSubmitting(true);
    setStatus({ type: "", message: "", meetLink: null });
    try {
      const res = await api.bookSlot({
        start: selectedSlot.start,
        end: selectedSlot.end,
        ...form
      });
      setStatus({ type: "success", message: res.message, meetLink: res.meetLink });
      setForm({ name: "", email: "", phone: "", sessionId: "", notes: "" });
      setSelectedSlot(null);
      loadSlots(); // refresh availability
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
            <h3 className="font-display text-xl font-bold">📅 Book a Slot on Meenu's Calendar</h3>
            <p className="mt-1 text-sm text-slate-500">{consultation?.bookingNote}</p>
          </div>
          <span
            className={`badge ${
              slotData?.connected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {slotData?.connected ? "● Live Google Calendar" : "● Demo availability"}
          </span>
        </div>

        {slotData && !slotData.connected && (
          <p className="mt-3 rounded-xl bg-yellow-50 p-3 text-xs text-yellow-800">{slotData.note}</p>
        )}

        {/* Slot picker */}
        {loadingSlots ? (
          <p className="mt-6 text-sm text-slate-500">Loading available slots…</p>
        ) : slotError ? (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{slotError}</p>
        ) : (
          <>
            {/* Day tabs */}
            <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    setSelectedDay(day);
                    setSelectedSlot(null);
                  }}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedDay === day
                      ? "bg-german-red text-white shadow"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {formatDay(slotsByDay[day][0].start)}
                </button>
              ))}
            </div>

            {/* Time slots for the chosen day */}
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

        {/* Booking form */}
        <form onSubmit={handleBook} className="mt-8 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
          {selectedSlot && (
            <p className="rounded-xl bg-german-gold/15 p-3 text-sm font-semibold text-slate-800 sm:col-span-2">
              Selected: {formatDay(selectedSlot.start)} · {formatTime(selectedSlot.start)} –{" "}
              {formatTime(selectedSlot.end)}
            </p>
          )}
          <input
            className="input-field"
            name="name"
            placeholder="Your name *"
            value={form.name}
            onChange={handleChange}
            required
          />
          <input
            className="input-field"
            name="email"
            type="email"
            placeholder="Your email * (calendar invite is sent here)"
            value={form.email}
            onChange={handleChange}
            required
          />
          <input
            className="input-field"
            name="phone"
            placeholder="Phone / WhatsApp"
            value={form.phone}
            onChange={handleChange}
          />
          <select className="input-field" name="sessionId" value={form.sessionId} onChange={handleChange} required>
            <option value="">Choose session type *</option>
            {consultation?.sessions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.duration} ({s.price})
              </option>
            ))}
          </select>
          <textarea
            className="input-field sm:col-span-2"
            name="notes"
            rows="3"
            placeholder="Anything Meenu should know? (optional)"
            value={form.notes}
            onChange={handleChange}
          />
          <button
            type="submit"
            disabled={submitting || !selectedSlot}
            className="btn btn-primary sm:col-span-2 disabled:opacity-60"
          >
            {submitting ? "Booking…" : selectedSlot ? "Confirm Booking" : "Select a slot above to book"}
          </button>
        </form>

        {status.message && (
          <div
            className={`mt-4 rounded-xl p-4 text-sm ${
              status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
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
