export default function About({ trainer }) {
  if (!trainer) return null;

  return (
    <section id="about" className="py-16 sm:py-20">
      <div className="container-site">
        <h2 className="section-title">
          About <span>Your Trainer</span>
        </h2>
        <p className="section-subtitle">Meet the person who will guide your German journey.</p>

        <div className="mt-12 grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="text-lg leading-relaxed text-slate-600">{trainer.bio}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              {trainer.socials &&
                Object.entries(trainer.socials).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium capitalize text-slate-700 transition hover:bg-german-gold/30"
                  >
                    {platform === "youtube" && "▶️ "}
                    {platform === "instagram" && "📸 "}
                    {platform === "linkedin" && "💼 "}
                    {platform}
                  </a>
                ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="card !p-8">
              <h3 className="font-display text-lg font-bold">Why learn with me?</h3>
              <ul className="mt-5 space-y-4">
                {trainer.highlights?.map((h) => (
                  <li key={h} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-german-gold/30 text-xs font-bold text-slate-900">
                      ✓
                    </span>
                    <span className="text-sm text-slate-600">{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
