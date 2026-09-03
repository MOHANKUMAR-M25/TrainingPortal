// ============================================================
// "My Learning" — the signed-in student's hub.
//
//   • lists the courses they've paid for, with progress bars
//   • clicking a course opens its dedicated page (#/course/<id>)
//     where the student watches videos, ticks modules and takes
//     the assessment
//
// Hidden for visitors who aren't signed in, and for admins (who
// have the Admin Panel instead).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

function ProgressBar({ percent, complete }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full transition-all duration-500 ${complete ? "bg-green-500" : "bg-german-red"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function MyLearning() {
  const { user, isAdmin, isGuest } = useAuth();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canLearn = Boolean(user?.email) && !isGuest && !isAdmin;

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.learning.myCourses();
      setCourses(data.courses || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canLearn) loadCourses();
    else setLoading(false);
  }, [canLearn, loadCourses]);

  // Refresh instantly when a payment/enrollment succeeds elsewhere on the
  // page (the Courses section dispatches "gt:enrolled" after Razorpay
  // verifies), so the new course shows up without a manual reload.
  useEffect(() => {
    const onEnrolled = () => {
      if (canLearn) loadCourses();
    };
    window.addEventListener("gt:enrolled", onEnrolled);
    return () => window.removeEventListener("gt:enrolled", onEnrolled);
  }, [canLearn, loadCourses]);

  // Opens the dedicated course page (App.jsx routes #/course/<id>).
  const openCourse = (courseId) => {
    window.location.hash = `#/course/${courseId}`;
  };

  if (!canLearn) return null;

  return (
    <section id="my-learning" className="scroll-mt-24 bg-slate-50 py-16 sm:py-20">
      <div className="container-site">
        <h2 className="section-title">
          My <span>Learning</span>
        </h2>
        <p className="section-subtitle">
          Open a course to watch its lessons, tick off modules and unlock your assessment.
        </p>

        {loading && <p className="mt-8 text-sm text-slate-500">Loading your courses…</p>}

        {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {!loading && courses.length === 0 && (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
            <p className="text-3xl" aria-hidden="true">📚</p>
            <h3 className="mt-3 font-display text-lg font-bold">You're not enrolled in a course yet</h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              Enroll in any course and it appears here straight away, with its module checklist and assessment.
            </p>
            <a href="#courses" className="btn btn-primary mt-5 !py-2.5 text-sm">
              Browse courses
            </a>
          </div>
        )}

        {courses.length > 0 && (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {courses.map((course) => (
              <button
                key={course.courseId}
                type="button"
                onClick={() => openCourse(course.courseId)}
                className="group rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {course.level && <span className="badge badge-level">{course.level}</span>}
                      {course.allModulesComplete && (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-green-700">
                          Modules complete
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-base font-bold sm:text-lg">{course.title}</h3>
                  </div>
                  <span
                    className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-400 transition group-hover:bg-german-red group-hover:text-white"
                    aria-hidden="true"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>
                      {course.total > 0
                        ? `${course.completed} of ${course.total} modules`
                        : "No modules published yet"}
                    </span>
                    <span>{course.percent}%</span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar percent={course.percent} complete={course.allModulesComplete} />
                  </div>
                </div>

                <p className="mt-4 text-sm font-semibold text-german-red">
                  📖 Open course →
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
