// ============================================================
// Spoken German — dedicated landing section.
//
// Content lives in `siteData.spokenGerman` so Meenu can edit the
// copy without touching this file. The enrol CTA deep-links to the
// matching course card in the Courses section (#course-<id>), which
// already owns the payment + coupon flow.
// ============================================================

import { useState } from "react";

function Accordion({ faqs }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={faq.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
            >
              <span className="text-sm font-semibold text-slate-900 sm:text-base">{faq.q}</span>
              <span
                aria-hidden="true"
                className={`shrink-0 text-german-red transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            {isOpen && <p className="px-5 pb-4 text-sm leading-relaxed text-slate-600">{faq.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function SpokenGerman({ content, course }) {
  if (!content?.enabled) return null;

  // Price comes from the linked course so there is a single source of truth.
  const price = course?.price || "";
  const ctaHref = content.courseId ? `#course-${content.courseId}` : "#courses";

  return (
    <section id="spoken-german" className="scroll-mt-24 bg-gradient-to-b from-white to-slate-50 py-16 sm:py-20">
      <div className="container-site">
        {/* ---- Header ---- */}
        <div className="max-w-3xl">
          {content.eyebrow && <span className="badge badge-level mb-3">{content.eyebrow}</span>}
          <h2 className="section-title">
            {content.title} <span>{content.titleAccent}</span>
          </h2>
          {content.tagline && (
            <p className="mt-3 font-display text-lg font-semibold text-slate-800 sm:text-xl">{content.tagline}</p>
          )}
          {content.description && (
            <p className="mt-3 text-base leading-relaxed text-slate-600">{content.description}</p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href={ctaHref} className="btn btn-primary !py-3 text-sm">
              {content.ctaLabel || "Enroll now"}
              {price && <span className="font-bold">· {price}</span>}
            </a>
            <a href="#booking-form" className="btn btn-outline !py-3 text-sm">
              Ask before enrolling
            </a>
          </div>
        </div>

        {/* ---- Who it's for / What you'll achieve ---- */}
        {(content.forWhom?.length > 0 || content.outcomes?.length > 0) && (
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {content.forWhom?.length > 0 && (
              <div className="card">
                <h3 className="font-display text-lg font-bold">🎯 This course is for you if…</h3>
                <ul className="mt-4 space-y-2.5">
                  {content.forWhom.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                      <span className="mt-0.5 shrink-0 text-german-red">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {content.outcomes?.length > 0 && (
              <div className="card">
                <h3 className="font-display text-lg font-bold">🚀 By the end you will…</h3>
                <ul className="mt-4 space-y-2.5">
                  {content.outcomes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                      <span className="mt-0.5 shrink-0 text-german-red">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ---- Format highlights ---- */}
        {content.format?.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.format.map((f) => (
              <div key={f.label} className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-100">
                <div className="text-2xl" aria-hidden="true">
                  {f.icon}
                </div>
                <p className="mt-2 font-display text-sm font-bold text-slate-900">{f.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{f.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* ---- Week-by-week curriculum ---- */}
        {content.modules?.length > 0 && (
          <div className="mt-14">
            <h3 className="font-display text-xl font-bold sm:text-2xl">Week-by-week curriculum</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.modules.map((m) => (
                <div key={m.week} className="card !p-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="badge badge-level">{m.week}</span>
                  </div>
                  <h4 className="mt-3 font-display text-base font-bold">{m.title}</h4>
                  <ul className="mt-3 space-y-1.5">
                    {m.points?.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                        <span className="mt-0.5 shrink-0 text-german-gold">▸</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- FAQs ---- */}
        {content.faqs?.length > 0 && (
          <div className="mt-14">
            <h3 className="font-display text-xl font-bold sm:text-2xl">Questions students ask</h3>
            <div className="mt-6 max-w-3xl">
              <Accordion faqs={content.faqs} />
            </div>
          </div>
        )}

        {/* ---- Closing CTA ---- */}
        <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-slate-900 px-6 py-10 text-center sm:px-10">
          <h3 className="font-display text-xl font-bold text-white sm:text-2xl">
            Ready to actually <span className="text-german-gold">speak</span> German?
          </h3>
          <p className="max-w-xl text-sm text-slate-300">
            Small batches fill quickly — six students per batch, morning and evening options.
          </p>
          <a href={ctaHref} className="btn btn-gold !py-3 text-sm">
            {content.ctaLabel || "Enroll now"}
            {price && <span className="font-bold">· {price}</span>}
          </a>
        </div>
      </div>
    </section>
  );
}
