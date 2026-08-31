// ============================================================
// Courses section — public course cards.
// Signed-in ADMINS additionally get ✏️ Edit and 🗑 Delete
// buttons directly on each course card (added or existing).
// ============================================================

import { useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

export default function Courses({ courses, onContentChanged }) {
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(null); // course being edited (features as string)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!courses?.length) return null;

  const startEdit = (course) => {
    setError("");
    setEditing({
      ...course,
      features: Array.isArray(course.features) ? course.features.join(", ") : course.features || "",
      externalLink: course.externalLink || ""
    });
  };

  const saveEdit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.admin.updateCourse(editing.id, {
        level: editing.level || "NEW",
        title: editing.title,
        description: editing.description,
        duration: editing.duration,
        mode: editing.mode,
        price: editing.price,
        features: editing.features
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        externalLink: editing.externalLink || ""
      });
      setEditing(null);
      onContentChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async (course) => {
    if (!window.confirm(`Delete course "${course.title}"?`)) return;
    setBusy(true);
    try {
      await api.admin.deleteCourse(course.id);
      onContentChanged?.();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };

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
            <div key={course.id} className="card relative flex flex-col">
              {/* Admin edit/delete controls */}
              {isAdmin && editing?.id !== course.id && (
                <div className="absolute -right-2 -top-2 z-10 flex gap-1.5">
                  <button
                    type="button"
                    title={`Edit ${course.title}`}
                    onClick={() => startEdit(course)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-german-gold text-slate-900 shadow-lg transition hover:scale-110"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={`Delete ${course.title}`}
                    disabled={busy}
                    onClick={() => removeCourse(course)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110 disabled:opacity-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              )}

              {/* Inline edit form (admins) */}
              {isAdmin && editing?.id === course.id ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-german-red">✏️ Edit Course</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input-field !py-2 text-xs" placeholder="Level (e.g. A1)" value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value })} />
                    <input className="input-field !py-2 text-xs" placeholder="Price (e.g. ₹9,999)" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                  </div>
                  <input className="input-field !py-2 text-xs" placeholder="Course title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  <textarea className="input-field !py-2 text-xs" rows="3" placeholder="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input-field !py-2 text-xs" placeholder="Duration" value={editing.duration} onChange={(e) => setEditing({ ...editing, duration: e.target.value })} />
                    <input className="input-field !py-2 text-xs" placeholder="Mode" value={editing.mode} onChange={(e) => setEditing({ ...editing, mode: e.target.value })} />
                  </div>
                  <textarea className="input-field !py-2 text-xs" rows="2" placeholder="Features (comma-separated)" value={editing.features} onChange={(e) => setEditing({ ...editing, features: e.target.value })} />
                  <input className="input-field !py-2 text-xs" placeholder="External link (enrollment URL, optional)" value={editing.externalLink} onChange={(e) => setEditing({ ...editing, externalLink: e.target.value })} />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={busy}
                      className="btn btn-gold flex-1 !py-2 text-xs disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="flex-1 rounded-full bg-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
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

                  {course.externalLink ? (
                    <a
                      href={course.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary mt-6 w-full !py-2.5 text-sm"
                    >
                      🔗 Enroll Now
                    </a>
                  ) : (
                    <a href="#contact" className="btn btn-outline mt-6 w-full !py-2.5 text-sm">
                      Enroll Now
                    </a>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
