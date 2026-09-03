// ============================================================
// CoursePage — full-screen dedicated page for one enrolled course
// (hash route: #/course/<id>). The student watches lesson videos,
// reads notes, ticks modules and starts the assessment here.
//
// Access control is server-side: /api/learning/courses/:id returns
// enrolled=false for students who don't own the course.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import AssessmentPlayer from "./AssessmentPlayer";

// Extracts a YouTube video id from watch/short/embed URLs (null = not YouTube).
function youTubeId(url) {
  const match = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match ? match[1] : null;
}

function VideoPlayer({ url, title }) {
  const yt = youTubeId(url);
  if (yt) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${yt}`}
          title={title || "Lesson video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <video controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" title={title || "Lesson video"}>
      <source src={url} />
      Your browser cannot play this video.{" "}
      <a href={url} target="_blank" rel="noreferrer">Open it directly ↗</a>
    </video>
  );
}

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

export default function CoursePage({ courseId, course, onBack }) {
  const { user, isAdmin, isGuest } = useAuth();
  const canLearn = Boolean(user?.email) && !isGuest;

  const [detail, setDetail] = useState(null);
  const [summary, setSummary] = useState(null); // hasAssessment etc. from /learning/me
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingModuleId, setSavingModuleId] = useState(null);
  const [showAssessment, setShowAssessment] = useState(false);
  // Certificate (unlocks at >= 80% on the assessment)
  const [cert, setCert] = useState(null);
  const [certDownloading, setCertDownloading] = useState(false);
  const [certError, setCertError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [progress, mine] = await Promise.all([
        api.learning.progress(courseId),
        api.learning.myCourses().catch(() => ({ courses: [] }))
      ]);
      setDetail(progress);
      setSummary((mine.courses || []).find((c) => String(c.courseId) === String(courseId)) || null);
      // Certificate eligibility is soft — a failure just hides the section.
      api.learning
        .certificateStatus(courseId)
        .then(setCert)
        .catch(() => setCert(null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (canLearn) load();
    else setLoading(false);
    window.scrollTo(0, 0);
  }, [canLearn, load]);

  const toggleModule = async (module) => {
    setSavingModuleId(module.id);
    setError("");
    try {
      const { progress } = await api.learning.setModuleDone(courseId, module.id, !module.completed);
      setDetail(progress);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingModuleId(null);
    }
  };

  const title = course?.title || detail?.courseTitle || `Course ${courseId}`;

  const downloadCertificate = async () => {
    setCertDownloading(true);
    setCertError("");
    try {
      await api.learning.downloadCertificate(courseId, title);
    } catch (err) {
      setCertError(err.message);
    } finally {
      setCertDownloading(false);
    }
  };

  // --- Guard rails -------------------------------------------------------
  if (!canLearn) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 pb-20 pt-28">
        <div className="container-site max-w-2xl rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
          <p className="text-4xl">🔐</p>
          <h1 className="mt-4 font-display text-xl font-bold">Sign in to open this course</h1>
          <p className="mt-2 text-sm text-slate-500">Log in with the student account you enrolled with.</p>
          <button onClick={onBack} className="btn btn-primary mt-6 !py-2.5 text-sm">← Back to home</button>
        </div>
      </main>
    );
  }

  if (showAssessment) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 pb-20 pt-28">
        <div className="container-site max-w-3xl">
          <h1 className="section-title">
            {title} — <span>Assessment</span>
          </h1>
          <div className="mt-8">
            <AssessmentPlayer
              courseId={Number(courseId)}
              courseTitle={title}
              onClose={() => {
                setShowAssessment(false);
                load();
              }}
              onFinished={load}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-20 pt-28">
      <div className="container-site max-w-4xl">
        {/* Header */}
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-german-red"
        >
          ← Back to My Learning
        </button>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            {course?.level && <span className="badge badge-level">{course.level}</span>}
            {detail?.allModulesComplete && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-green-700">
                Modules complete
              </span>
            )}
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{title}</h1>

          {detail && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  {detail.total > 0
                    ? `${detail.completed} of ${detail.total} modules complete`
                    : "No modules published yet"}
                </span>
                <span>{detail.percent}%</span>
              </div>
              <div className="mt-1.5">
                <ProgressBar percent={detail.percent} complete={detail.allModulesComplete} />
              </div>
            </div>
          )}
        </div>

        {loading && <p className="mt-8 text-sm text-slate-500">Loading your course…</p>}
        {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {/* Not enrolled (server said so) */}
        {!loading && detail && !detail.enrolled && !isAdmin && (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100">
            <p className="text-4xl">🔒</p>
            <h2 className="mt-4 font-display text-lg font-bold">You're not enrolled in this course</h2>
            <p className="mt-2 text-sm text-slate-500">Enroll from the Courses section to unlock the lessons.</p>
            <button onClick={onBack} className="btn btn-primary mt-6 !py-2.5 text-sm">← Back to home</button>
          </div>
        )}

        {/* No content yet */}
        {!loading && detail && (detail.enrolled || isAdmin) && detail.modules?.length === 0 && (
          <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
            <p className="text-3xl" aria-hidden="true">📭</p>
            <h2 className="mt-3 font-display text-lg font-bold">Course content coming soon</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              You're enrolled, but the module checklist and assessment for this course haven't been published yet.
              Check back soon — lessons will appear here automatically as they're added.
            </p>
          </div>
        )}

        {/* Modules */}
        {!loading && detail && (detail.enrolled || isAdmin) && detail.modules?.length > 0 && (
          <ol className="mt-8 space-y-4">
            {detail.modules.map((module, i) => (
              <li key={module.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleModule(module)}
                      disabled={savingModuleId === module.id || module.seedOnly || !detail.enrolled}
                      aria-label={`Mark "${module.title}" as ${module.completed ? "not done" : "done"}`}
                      title={
                        module.seedOnly
                          ? "Progress tracking needs the database"
                          : module.completed
                          ? "Mark as not done"
                          : "Mark as done"
                      }
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition disabled:opacity-40 ${
                        module.completed
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-slate-300 bg-white text-transparent hover:border-german-red"
                      }`}
                    >
                      ✓
                    </button>

                    <div className="min-w-0 flex-1">
                      <h3
                        className={`font-display text-base font-bold sm:text-lg ${
                          module.completed ? "text-slate-400 line-through" : "text-slate-900"
                        }`}
                      >
                        {i + 1}. {module.title}
                      </h3>
                      {module.summary && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{module.summary}</p>
                      )}
                    </div>
                    {module.durationLabel && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        ⏱ {module.durationLabel}
                      </span>
                    )}
                  </div>

                  {/* Lesson video */}
                  {module.videoUrl && (
                    <div className="mt-4">
                      <VideoPlayer url={module.videoUrl} title={module.title} />
                    </div>
                  )}

                  {module.content && (
                    <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                      {module.content}
                    </p>
                  )}

                  {module.resourceUrl && (
                    <a
                      href={module.resourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm font-semibold text-german-red underline"
                    >
                      📎 Open resource ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* Certificate — unlocked at >= minPercent (80%) on the assessment */}
        {!loading && detail && (detail.enrolled || isAdmin) && cert && (
          <div
            className={`mt-8 rounded-2xl p-6 shadow-sm ring-1 ${
              cert.eligible ? "bg-green-50 ring-green-200" : "bg-white ring-slate-100"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-slate-900">
                  🏆 Course Certificate
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {cert.eligible
                    ? `Congratulations! You scored ${cert.percent}% — your certificate is ready.`
                    : cert.reason ||
                      `Score ${cert.minPercent || 80}% or above on the assessment to earn your certificate.`}
                </p>
                {certError && <p className="mt-1 text-xs text-red-600">{certError}</p>}
              </div>
              <button
                type="button"
                onClick={downloadCertificate}
                disabled={!cert.eligible || certDownloading}
                className="btn btn-primary shrink-0 !py-2.5 text-sm disabled:opacity-40"
              >
                {certDownloading ? "Preparing…" : cert.eligible ? "📄 Download Certificate (PDF)" : "🔒 Locked"}
              </button>
            </div>
          </div>
        )}

        {/* Assessment — shown for every course; the player handles the
            "no assessment / no questions yet" case with a request button. */}
        {!loading && detail && (detail.enrolled || isAdmin) && (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-slate-900">
                  {summary?.assessmentFormat === "oral" ? "🎤 Oral assessment" : "📝 Course assessment"}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {!summary?.hasAssessment
                    ? "Open to check availability — you can request questions if none are published yet."
                    : detail.allModulesComplete
                    ? summary?.assessmentFormat === "oral"
                      ? "Ready — you'll record spoken answers with your mic."
                      : "Ready when you are."
                    : `Unlocks when all ${detail.total} modules are ticked.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssessment(true)}
                className="btn btn-primary shrink-0 !py-2.5 text-sm"
              >
                Open assessment
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
