import { useState } from "react";
import CalendarBooking from "./CalendarBooking";

export default function Consultation({ consultation, coupons = [], flashSale }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  if (!consultation) return null;

  // Codes valid on consultations, so visitors know a discount exists before
  // they scroll down to the booking form.
  const consultationCoupons = (coupons || []).filter(
    (c) => c.appliesTo === "all" || c.appliesTo === "consultation"
  );

  return (
    <section id="consultation" className="py-16 sm:py-20">
      <div className="container-site">
        <h2 className="section-title">
          One-on-One <span>Consultation</span>
        </h2>
        <p className="section-subtitle">{consultation.description}</p>

        {consultationCoupons.length > 0 && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl bg-german-gold/20 px-4 py-2.5 text-sm font-semibold text-yellow-900">
            <span aria-hidden="true">🎟</span>
            <span>Save on your session — use</span>
            {consultationCoupons.map((c) => (
              <span
                key={c.code}
                title={c.description}
                className="rounded-md border border-dashed border-yellow-700/40 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-wider"
              >
                {c.code} · {c.label}
              </span>
            ))}
            <span className="font-normal text-yellow-800">at checkout</span>
          </p>
        )}

        {/* Session cards */}
        <div className="mt-10 grid gap-6 sm:mt-12 sm:gap-8 md:grid-cols-3">
          {consultation.sessions?.map((s, i) => (
            <div
              key={s.id}
              className={`card flex flex-col text-center ${
                i === 1 || selectedSessionId === s.id ? "ring-2 !ring-german-gold" : ""
              }`}
            >
              {i === 1 && <span className="badge badge-level mx-auto -mt-2 mb-3">Most Popular</span>}
              <h3 className="font-display text-lg font-bold">{s.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{s.duration}</p>
              <p className="mt-4 font-display text-4xl font-extrabold text-german-red">{s.price}</p>
              <ul className="mt-6 flex-1 space-y-2 text-left">
                {s.includes?.map((inc) => (
                  <li key={inc} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-german-red">✓</span> {inc}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setSelectedSessionId(s.id);
                  document.getElementById("booking-form")?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`btn mt-6 w-full !py-2.5 text-sm ${i === 1 ? "btn-gold" : "btn-outline"}`}
              >
                Book This Session
              </button>
            </div>
          ))}
        </div>

        {/* Google Calendar slot booking */}
        <CalendarBooking consultation={consultation} coupons={coupons} flashSale={flashSale} />
      </div>
    </section>
  );
}
