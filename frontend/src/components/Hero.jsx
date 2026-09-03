import api from "../api";
import EditableImage from "./EditableImage";

// `tightTop` is set when the flash sale banner is showing — the banner has
// already cleared the fixed navbar, so the hero doesn't need to.
export default function Hero({ trainer, onContentChanged, tightTop = false }) {
  return (
    <section
      id="home"
      className={`relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-yellow-50 pb-16 sm:pb-20 ${
        tightTop ? "pt-10 sm:pt-14" : "pt-24 sm:pt-28"
      }`}
    >
      <div className="container-site grid items-center gap-10 sm:gap-12 lg:grid-cols-2">
        {/* Text */}
        <div className="animate-fade-in-up">
          <span className="badge badge-level mb-4">Certified · Goethe-Institut</span>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
            Learn German with{" "}
            <span className="text-german-red">{trainer?.name || "Meenu"}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">{trainer?.tagline}</p>
          <p className="mt-2 max-w-xl text-sm text-slate-500">{trainer?.title}</p>

          {/* Full-width stacked buttons on phones give a comfortable tap target. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <a href="#courses" className="btn btn-primary w-full sm:w-auto">
              Explore Courses
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
            <a href="#booking-form" className="btn btn-outline w-full sm:w-auto">
              📅 Book 1-on-1 Consultation
            </a>
          </div>

          {/* Stats */}
          <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {[
              ["12+", "Years Experience"],
              ["2,000+", "Students Trained"],
              ["98%", "Exam Pass Rate"]
            ].map(([num, label]) => (
              <div key={label} className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-slate-100">
                <div className="font-display text-2xl font-bold text-german-red">{num}</div>
                <div className="mt-1 text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Image (admin-editable) */}
        <div className="relative animate-fade-in lg:justify-self-end">
          <div className="absolute -inset-4 rotate-3 rounded-3xl bg-gradient-to-tr from-german-gold/40 to-german-red/20" />
          <EditableImage
            src={trainer?.photo}
            alt={trainer?.name}
            label="trainer photo"
            className="relative w-full max-w-md"
            imgClassName="aspect-[4/5] w-full rounded-3xl object-cover shadow-2xl"
            onSave={async (newUrl) => {
              await api.admin.updateTrainerPhoto(newUrl);
              onContentChanged?.();
            }}
          />
          <div className="absolute -bottom-5 -left-5 rounded-2xl bg-white px-5 py-3 shadow-xl ring-1 ring-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎓</span>
              <div>
                <p className="text-sm font-bold text-slate-900">C2 Certified</p>
                <p className="text-xs text-slate-500">Goethe Certificate</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
