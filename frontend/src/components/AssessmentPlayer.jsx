// ============================================================
// Assessment player — one question at a time.
//
//   written : mcq / multi / text, auto-scored on submit
//   oral    : each answer recorded with the mic and uploaded as it
//             is made, then Meenu reviews and scores it
//
// Correct answers are never sent to the browser before grading, so
// this component genuinely cannot reveal them.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import OralRecorder from "./OralRecorder";

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Countdown for timed written assessments; auto-submits at zero. */
function useCountdown(minutes, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(minutes ? minutes * 60 : null);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!minutes) return undefined;
    const id = setInterval(() => {
      setSecondsLeft((previous) => {
        if (previous == null) return previous;
        if (previous <= 1) {
          clearInterval(id);
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire?.();
          }
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [minutes, onExpire]);

  return secondsLeft;
}

export default function AssessmentPlayer({ courseId, courseTitle, onClose, onFinished }) {
  const [status, setStatus] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState({}); // questionId -> value
  const [savedAudio, setSavedAudio] = useState({}); // questionId -> true
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // "Request questions" flow when the admin hasn't published any yet
  const [requesting, setRequesting] = useState(false);
  const [requestNote, setRequestNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await api.assessment.status(courseId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const isOral = attempt && questions.some((q) => q.type === "oral");

  const submit = useCallback(
    async (auto = false) => {
      if (!attempt || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        const answers = questions
          .filter((q) => q.type !== "oral")
          .map((q) => ({ questionId: q.id, response: responses[q.id] ?? null }));

        const outcome = await api.assessment.submit(attempt.id, answers);
        setResult({ ...outcome, autoSubmitted: auto });
        onFinished?.();
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, questions, responses, submitting, onFinished]
  );

  // Timed written assessments submit themselves when the clock runs out.
  const secondsLeft = useCountdown(
    attempt && !result && !isOral ? status?.assessment?.timeLimitMinutes : null,
    () => submit(true)
  );

  const begin = async () => {
    setStarting(true);
    setError("");
    try {
      const started = await api.assessment.start(courseId);
      setAttempt(started.attempt);
      setQuestions(started.questions || []);
      setIndex(0);

      // A resumed attempt may already have recordings stored.
      if (started.resumed) {
        try {
          const existing = await api.assessment.result(started.attempt.id);
          const done = {};
          (existing.review || []).forEach((item) => {
            if (item.audioUrl) done[item.questionId] = true;
          });
          setSavedAudio(done);
        } catch {
          // Non-fatal: the student can simply re-record.
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const uploadRecording = async (question, blob, filename) => {
    setUploading(true);
    try {
      await api.assessment.uploadAudio(attempt.id, question.id, blob, filename);
      setSavedAudio((previous) => ({ ...previous, [question.id]: true }));
    } finally {
      setUploading(false);
    }
  };

  const answeredCount = useMemo(() => {
    return questions.filter((q) =>
      q.type === "oral"
        ? savedAudio[q.id]
        : Array.isArray(responses[q.id])
        ? responses[q.id].length > 0
        : responses[q.id] != null && String(responses[q.id]).trim() !== ""
    ).length;
  }, [questions, responses, savedAudio]);

  // ---------------- results ----------------
  if (result) {
    const { attempt: finished, needsReview, review } = result;
    return (
      <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-100 sm:p-8">
        {needsReview ? (
          <>
            <p className="text-4xl" aria-hidden="true">🎤</p>
            <h3 className="mt-3 font-display text-xl font-bold sm:text-2xl">Recordings submitted!</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Meenu will listen to each answer and score your fluency, pronunciation and content. You'll get an
              email with her feedback, and your result will appear under <b>My Learning</b>.
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl" aria-hidden="true">{finished.passed ? "🎉" : "📋"}</p>
            <h3 className="mt-3 font-display text-xl font-bold sm:text-2xl">
              {finished.passed ? "You passed!" : "Not quite yet"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {finished.totalPoints} / {finished.maxPoints} points ·{" "}
              <span className={`font-bold ${finished.passed ? "text-green-700" : "text-german-red"}`}>
                {finished.percent}%
              </span>
            </p>
            {result.autoSubmitted && (
              <p className="mt-2 rounded-lg bg-yellow-50 p-2.5 text-xs text-yellow-800">
                ⏱ Time ran out, so your answers were submitted automatically.
              </p>
            )}

            {review?.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-left">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Your answers</p>
                {review.map((item, i) => (
                  <div
                    key={item.questionId}
                    className={`rounded-xl p-3.5 ${item.autoCorrect ? "bg-green-50" : "bg-red-50"}`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      <span aria-hidden="true">{item.autoCorrect ? "✓" : "✕"}</span> {i + 1}. {item.prompt}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      You answered:{" "}
                      <b>
                        {item.type === "text"
                          ? String(item.response ?? "—") || "—"
                          : (item.response || []).map((n) => item.options?.[n]).filter(Boolean).join(", ") || "—"}
                      </b>
                    </p>
                    {!item.autoCorrect && (
                      <p className="mt-1 text-xs text-slate-600">
                        Correct answer:{" "}
                        <b className="text-green-700">
                          {item.type === "text"
                            ? item.acceptedAnswers?.join(" / ")
                            : (item.correctOptions || []).map((n) => item.options?.[n]).join(", ")}
                        </b>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="btn btn-primary flex-1 !py-2.5 text-sm">
            Back to my courses
          </button>
        </div>
      </div>
    );
  }

  // ---------------- loading / gate ----------------
  if (loading) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow ring-1 ring-slate-100">Loading assessment…</p>;
  }

  if (error && !attempt) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow ring-1 ring-slate-100">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        <button type="button" onClick={onClose} className="btn btn-outline mt-4 !py-2.5 text-sm">
          Go back
        </button>
      </div>
    );
  }

  const requestQuestions = async () => {
    setRequesting(true);
    setRequestNote("");
    try {
      const res = await api.assessment.requestQuestions(courseId);
      setRequestNote(res.message || "Request sent! Meenu has been notified.");
    } catch (err) {
      setRequestNote("⚠️ " + err.message);
    } finally {
      setRequesting(false);
    }
  };

  if (!attempt) {
    // No assessment exists, or it exists but has no questions yet — show a
    // friendly message and let the student ping the trainer.
    const noQuestions = status?.exists && !status?.assessment?.questionCount;
    if (!status?.exists || noQuestions) {
      return (
        <div className="rounded-2xl bg-white p-6 shadow ring-1 ring-slate-100 sm:p-8">
          <p className="text-4xl" aria-hidden="true">📭</p>
          <h3 className="mt-3 font-display text-xl font-bold">No questions were added yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            The assessment for <b>{courseTitle}</b> isn't ready — Meenu hasn't published any questions for it yet.
            Please click the request button below, and she'll be notified to add them.
          </p>

          {requestNote ? (
            <p
              className={`mt-4 rounded-xl p-3.5 text-sm ${
                requestNote.startsWith("⚠️") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
              }`}
            >
              {requestNote.startsWith("⚠️") ? requestNote : `✅ ${requestNote}`}
            </p>
          ) : (
            <button
              type="button"
              onClick={requestQuestions}
              disabled={requesting}
              className="btn btn-primary mt-5 !py-2.5 text-sm disabled:opacity-60"
            >
              {requesting ? "Sending request…" : "🔔 Request questions from Meenu"}
            </button>
          )}

          <button type="button" onClick={onClose} className="btn btn-outline mt-4 !py-2.5 text-sm sm:ml-2">
            Go back
          </button>
        </div>
      );
    }

    const { assessment, progress, unlocked, lockedReason, attemptsLeft, best } = status;

    return (
      <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-100 sm:p-8">
        <span className="badge badge-level">
          {assessment.format === "oral" ? "🎤 Oral assessment" : "📝 Written assessment"}
        </span>
        <h3 className="mt-3 font-display text-xl font-bold sm:text-2xl">{assessment.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{courseTitle}</p>
        {assessment.description && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{assessment.description}</p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Questions", assessment.questionCount],
            ["Total points", assessment.totalPoints],
            ["Pass mark", `${assessment.passPercent}%`],
            ["Time limit", assessment.timeLimitMinutes ? `${assessment.timeLimitMinutes} min` : "None"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="mt-0.5 font-display text-lg font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        {/* Module progress gate */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Course progress</span>
            <span>
              {progress.completed}/{progress.total} modules
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all ${progress.allModulesComplete ? "bg-green-500" : "bg-german-gold"}`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {best && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            Your best so far: <b>{best.percent}%</b> {best.passed ? "· passed ✅" : "· not passed yet"}
          </p>
        )}

        {unlocked ? (
          <>
            {assessment.format === "oral" && (
              <p className="mt-4 rounded-xl bg-german-gold/15 p-3 text-xs leading-relaxed text-yellow-900">
                🎤 <b>Before you start:</b> find a quiet room and allow microphone access when your browser asks.
                Each task gives you thinking time, then records your spoken answer. You can listen back and
                re-record any answer before submitting.
              </p>
            )}
            <button
              type="button"
              onClick={begin}
              disabled={starting}
              className="btn btn-primary mt-5 w-full !py-3 text-sm disabled:opacity-60"
            >
              {starting ? "Preparing…" : status.inProgressAttemptId ? "Resume assessment" : "Start assessment"}
            </button>
            {attemptsLeft != null && (
              <p className="mt-2 text-center text-xs text-slate-500">
                {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} remaining
              </p>
            )}
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">🔒 {lockedReason}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full py-2 text-xs font-semibold text-slate-500 underline hover:text-german-red"
        >
          Back to my courses
        </button>
      </div>
    );
  }

  // ---------------- taking the assessment ----------------
  const question = questions[index];
  const isLast = index === questions.length - 1;

  const setResponse = (value) => setResponses((previous) => ({ ...previous, [question.id]: value }));

  const toggleMulti = (optionIndex) => {
    const current = Array.isArray(responses[question.id]) ? responses[question.id] : [];
    setResponse(
      current.includes(optionIndex)
        ? current.filter((n) => n !== optionIndex)
        : [...current, optionIndex]
    );
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-100 sm:p-8">
      {/* Progress header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Question {index + 1} of {questions.length}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {answeredCount}/{questions.length} answered
          </span>
          {secondsLeft != null && (
            <span
              className={`rounded-full px-2.5 py-1 font-display text-xs font-bold tabular-nums ${
                secondsLeft < 60 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
              }`}
              role="timer"
            >
              ⏱ {formatClock(secondsLeft)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-german-red transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <div className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-display text-base font-bold leading-snug text-slate-900 sm:text-lg">
            {question.prompt}
          </h4>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {question.points} pt{question.points === 1 ? "" : "s"}
          </span>
        </div>
        {question.helperText && <p className="mt-1.5 text-xs italic text-slate-500">{question.helperText}</p>}
      </div>

      {/* Answer input */}
      <div className="mt-5">
        {question.type === "mcq" && (
          <div className="space-y-2">
            {question.options.map((option, optionIndex) => {
              const selected = responses[question.id]?.[0] === optionIndex;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setResponse([optionIndex])}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition ${
                    selected
                      ? "border-german-red bg-red-50 font-semibold text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-german-red bg-german-red text-white" : "border-slate-300"
                    }`}
                    aria-hidden="true"
                  >
                    {selected && "✓"}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {question.type === "multi" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">Choose all that apply</p>
            {question.options.map((option, optionIndex) => {
              const selected = (responses[question.id] || []).includes(optionIndex);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleMulti(optionIndex)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left text-sm transition ${
                    selected
                      ? "border-german-red bg-red-50 font-semibold text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      selected ? "border-german-red bg-german-red text-white" : "border-slate-300"
                    }`}
                    aria-hidden="true"
                  >
                    {selected && "✓"}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {question.type === "text" && (
          <>
            <input
              className="input-field !text-base"
              placeholder="Type your answer in German"
              value={responses[question.id] ?? ""}
              onChange={(e) => setResponse(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Umlauts are flexible — „ue“ is accepted for „ü“.
            </p>
          </>
        )}

        {question.type === "oral" && (
          <OralRecorder
            key={question.id}
            prepSeconds={question.prepSeconds}
            maxSeconds={question.maxSeconds}
            uploaded={Boolean(savedAudio[question.id])}
            busy={uploading}
            onRecorded={(blob, filename) => uploadRecording(question, blob, filename)}
          />
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Navigation */}
      <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-5 sm:flex-row">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0 || submitting}
          className="rounded-full bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40 sm:w-auto"
        >
          ← Previous
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={submitting || uploading}
            className="btn btn-primary flex-1 !py-2.5 text-sm disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit assessment"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={submitting}
            className="btn btn-primary flex-1 !py-2.5 text-sm disabled:opacity-60"
          >
            Next →
          </button>
        )}
      </div>

      {/* Jump-to grid, so nothing gets missed before submitting */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {questions.map((q, i) => {
          const done =
            q.type === "oral"
              ? savedAudio[q.id]
              : Array.isArray(responses[q.id])
              ? responses[q.id].length > 0
              : responses[q.id] != null && String(responses[q.id]).trim() !== "";
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to question ${i + 1}${done ? " (answered)" : ""}`}
              className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                i === index
                  ? "bg-german-red text-white"
                  : done
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
