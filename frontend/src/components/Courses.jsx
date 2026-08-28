export default function Courses({ courses }) {
  if (!courses?.length) return null;

  return (
    <section id="courses" className="bg-slate-50 py-20">
      <div className="container-site">
        <h2 className="section-title">
          German <span>Courses</span>
        </h2>
        <p className="section-subtitle">
          Structured programs from complete beginner to advanced — all levels aligned with CEFR standards.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <div key={course.id} className="card flex flex-col">
              <div className="flex items-start justify-between">
                <span className="badge badge-level">{course.level}</span>
                <span className="font-display text-2xl font-bold text-german-red">{course.price}</span>
              </div>

              <h3 className="mt-4 font-display text-xl font-bold">{course.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{course.description}</p>

              <div className="mt-4 space-y-1 text-xs text-slate-500">
                <p>⏱ {course.duration}</p>
                <p>💻 {course.mode}</p>
              </div>

              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {course.features?.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-german-red">✓</span> {f}
                  </li>
                ))}
              </ul>

              <a href="#contact" className="btn btn-outline mt-6 w-full !py-2.5 text-sm">
                Enroll Now
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
