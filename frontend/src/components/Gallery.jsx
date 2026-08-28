import { useState } from "react";

export default function Gallery({ gallery }) {
  const [lightbox, setLightbox] = useState(null);

  if (!gallery?.length) return null;

  return (
    <section id="gallery" className="py-20">
      <div className="container-site">
        <h2 className="section-title">
          Photo <span>Gallery</span>
        </h2>
        <p className="section-subtitle">Moments from classes, workshops and cultural excursions.</p>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3">
          {gallery.map((img) => (
            <button
              key={img.id}
              className="group relative overflow-hidden rounded-2xl"
              onClick={() => setLightbox(img)}
              aria-label={`View ${img.title}`}
            >
              <img
                src={img.url}
                alt={img.title}
                className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-left text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">
                {img.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
        >
          <div className="max-w-4xl">
            <img src={lightbox.url} alt={lightbox.title} className="max-h-[80vh] rounded-2xl shadow-2xl" />
            <p className="mt-3 text-center text-white">{lightbox.title}</p>
          </div>
          <button
            className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
