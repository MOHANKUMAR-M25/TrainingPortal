import { useState } from "react";

export default function Videos({ videos }) {
  const [playing, setPlaying] = useState(null);

  if (!videos?.length) return null;

  return (
    <section id="videos" className="bg-slate-900 py-20">
      <div className="container-site">
        <h2 className="section-title !text-white">
          Free <span>Video Lessons</span>
        </h2>
        <p className="section-subtitle !text-slate-400">
          Get a taste of my teaching style with these free lessons on YouTube.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="group overflow-hidden rounded-2xl bg-slate-800 shadow-lg">
              <div className="relative aspect-video">
                {playing === v.id ? (
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${v.youtubeId}?autoplay=1`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button
                    className="relative h-full w-full"
                    onClick={() => setPlaying(v.id)}
                    aria-label={`Play ${v.title}`}
                  >
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/10">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-german-red text-white shadow-xl">
                        <svg className="ml-1 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </button>
                )}
              </div>
              <div className="p-5">
                <h3 className="font-display text-base font-bold text-white">{v.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{v.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
