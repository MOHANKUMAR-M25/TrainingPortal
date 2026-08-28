export default function Testimonials({ testimonials }) {
  if (!testimonials?.length) return null;

  return (
    <section id="testimonials" className="py-20">
      <div className="container-site">
        <h2 className="section-title">
          Success <span>Stories</span>
        </h2>
        <p className="section-subtitle">Real journeys of students who transformed their lives through German.</p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.id} className="card relative flex flex-col !p-8">
              <span className="absolute -top-4 left-8 font-display text-6xl leading-none text-german-gold">“</span>
              <blockquote className="flex-1 pt-4 text-sm leading-relaxed text-slate-600">{t.text}</blockquote>
              <figcaption className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-5">
                <img
                  src={t.photo}
                  alt={t.name}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-german-gold/50"
                  loading="lazy"
                />
                <div>
                  <p className="text-sm font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
