function Stars({ rating }) {
  return (
    <div className="flex gap-0.5 text-lg" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "star" : "star-muted"}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function Reviews({ reviews }) {
  return (
    <section id="reviews" className="bg-slate-50 py-20">
      <div className="container-site">
        <h2 className="section-title">
          Student <span>Reviews</span>
        </h2>
        <p className="section-subtitle">
          What students around the world say about their learning experience. Reviews are curated and published by the
          trainer.
        </p>

        {/* Reviews grid */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {reviews?.map((r) => (
            <div key={r.id} className="card">
              <Stars rating={r.rating} />
              <p className="mt-3 text-sm leading-relaxed text-slate-600">“{r.text}”</p>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="font-semibold text-slate-900">{r.name}</p>
                <p className="text-xs text-slate-500">
                  {r.country} · {r.course}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
