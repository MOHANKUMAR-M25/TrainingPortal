import { useState } from "react";
import api from "../api";
import EditableImage from "./EditableImage";

export default function Gallery({ gallery, onContentChanged }) {
  const [lightbox, setLightbox] = useState(null);

  if (!gallery?.length) return null;

  return (
    <section id="gallery" className="py-16 sm:py-20">
      <div className="container-site">
        <h2 className="section-title">
          Photo <span>Gallery</span>
        </h2>
        <p className="section-subtitle">Moments from classes, workshops and cultural excursions.</p>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3">
          {gallery.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-2xl">
              <EditableImage
                src={img.url}
                alt={img.title}
                label={`"${img.title}"`}
                imgClassName="aspect-[4/3] w-full cursor-pointer object-cover transition duration-500 group-hover:scale-110"
                onSave={async (newUrl) => {
                  await api.admin.updateImage(img.id, { url: newUrl });
                  onContentChanged?.();
                }}
              />
              {/* Touch devices have no hover, so the caption (the only way to
                  open the lightbox) stays visible on small screens and only
                  reveals on hover from the md breakpoint up. */}
              <button
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-8 text-left text-xs font-medium text-white transition sm:text-sm md:opacity-0 md:group-hover:opacity-100"
                onClick={() => setLightbox(img)}
                aria-label={`View ${img.title}`}
              >
                {img.title}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
        >
          <div className="max-w-4xl">
            <img
              src={lightbox.url}
              alt={lightbox.title}
              className="max-h-[70vh] w-full rounded-2xl object-contain shadow-2xl sm:max-h-[80vh]"
            />
            <p className="mt-3 px-2 text-center text-sm text-white sm:text-base">{lightbox.title}</p>
          </div>
          {/* Positioned clear of the iOS status bar / notch. */}
          <button
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 sm:right-6 sm:top-6"
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
