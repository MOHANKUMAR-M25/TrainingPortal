// ============================================================
// Admin Panel → 🎤 Grading
// Attempts containing spoken answers land here. Meenu plays each
// recording, scores it out of the question's points, adds a note,
// and submits — which finalizes the attempt and emails the
// student their result.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";

function formatWhen(iso) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString();
}

export default function GradingAdmin() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAttempt, setOpenAttempt] = useState(null); // { attempt, items }
  const [detailLoading, setDetailLoading] = useState(false);
  const [scores, setScores] = useState({}); // questionId -> { points, note }
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { attempts } = await api.admin.gradingQueue();
      setQueue(attempts || []);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const open = async (attemptId) => {
    setDetailLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const detail = await api.admin.getAttemptForGrading(attemptId);
      setOpenAttempt(detail);
      setFeedback(detail.attempt.trainerFeedback || "");

      // Pre-fill with any existing scores so a partly-graded attempt reopens
      // where it was left.
      const initial = {};
      detail.items
        .filter((item) => item.needsReview)
        .forEach((item) => {
          initial[item.questionId] = {
            points: item.trainerPoints ?? "",
            note: item.trainerNote || ""
          };
        });
      setScores(initial);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const setScore = (questionId, patch) =>
    setScores((previous) => ({ ...previous, [questionId]: { ...previous[questionId], ...patch } }));

  const reviewItems = (openAttempt?.items || []).filter((item) => item.needsReview);
  const autoItems = (openAttempt?.items || []).filter((item) => !item.needsReview);

  const allScored = reviewItems.every((item) => {
    const value = scores[item.questionId]?.points;
    return value !== "" && value != null && Number.isFinite(Number(value));
  });

  const trainerTotal = reviewItems.reduce((sum, item) => sum + (Number(scores[item.questionId]?.points) || 0), 0);
  const projectedTotal = Number(openAttempt?.attempt.autoPoints || 0) + trainerTotal;
  const projectedPercent = openAttempt?.attempt.maxPoints
    ? Math.round((projectedTotal / openAttempt.attempt.maxPoints) * 1000) / 10
    : 0;

  const submitGrade = async () => {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await api.admin.gradeAttempt(openAttempt.attempt.id, {
        scores: reviewItems.map((item) => ({
          questionId: item.questionId,
          points: Number(scores[item.questionId]?.points) || 0,
          note: scores[item.questionId]?.note || ""
        })),
        feedback
      });
      setStatus({
        type: "success",
        message: `✅ Graded — ${projectedPercent}%. The student has been emailed their result and feedback.`
      });
      setOpenAttempt(null);
      await loadQueue();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  // ---------------- grading one attempt ----------------
  if (openAttempt) {
    const { attempt } = openAttempt;
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpenAttempt(null)}
          className="text-xs font-semibold text-german-gold underline"
        >
          ← Back to the queue
        </button>

        <div className="mt-3 rounded-xl bg-slate-900/60 p-5">
          <h3 className="font-display text-base font-bold text-white">
            {attempt.name || attempt.email}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            {attempt.email} · {attempt.courseTitle} · submitted {formatWhen(attempt.submittedAt)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Auto-scored so far: <b className="text-slate-200">{attempt.autoPoints}</b> / {attempt.maxPoints} points
          </p>
        </div>

        {/* Auto-scored answers, for context */}
        {autoItems.length > 0 && (
          <div className="mt-4 rounded-xl bg-slate-900/40 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Auto-scored answers
            </p>
            <ul className="mt-2 space-y-1">
              {autoItems.map((item) => (
                <li key={item.questionId} className="text-xs text-slate-400">
                  <span className={item.autoCorrect ? "text-green-400" : "text-red-400"}>
                    {item.autoCorrect ? "✓" : "✕"}
                  </span>{" "}
                  {item.prompt} — {item.awardedPoints}/{item.points}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recordings to score */}
        <div className="mt-4 space-y-4">
          {reviewItems.map((item, index) => (
            <div key={item.questionId} className="rounded-xl bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold text-white">
                  {index + 1}. {item.prompt}
                </p>
                <span className="shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-300">
                  max {item.points}
                </span>
              </div>
              {item.helperText && <p className="mt-1 text-xs italic text-slate-500">{item.helperText}</p>}

              {item.audioUrl ? (
                <div className="mt-3">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- student's spoken answer */}
                  <audio src={item.audioUrl} controls preload="none" className="w-full" />
                  <a
                    href={item.audioUrl}
                    download
                    className="mt-1 inline-block text-[11px] text-slate-500 underline hover:text-german-gold"
                  >
                    Download recording
                  </a>
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-yellow-500/10 p-2.5 text-xs text-yellow-400">
                  ⚠️ No recording was submitted for this task — score 0 unless you want to allow a retake.
                </p>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
                <div>
                  <label
                    htmlFor={`score-${item.questionId}`}
                    className="mb-1 block text-[11px] font-semibold text-slate-400"
                  >
                    Score / {item.points}
                  </label>
                  <input
                    id={`score-${item.questionId}`}
                    className="input-field !py-2 text-xs"
                    type="number"
                    min="0"
                    max={item.points}
                    step="0.5"
                    placeholder="0"
                    value={scores[item.questionId]?.points ?? ""}
                    onChange={(e) => setScore(item.questionId, { points: e.target.value })}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`note-${item.questionId}`}
                    className="mb-1 block text-[11px] font-semibold text-slate-400"
                  >
                    Feedback on this answer (the student sees this)
                  </label>
                  <input
                    id={`note-${item.questionId}`}
                    className="input-field !py-2 text-xs"
                    placeholder="e.g. Good fluency — watch the „ch“ in „ich“."
                    value={scores[item.questionId]?.note ?? ""}
                    onChange={(e) => setScore(item.questionId, { note: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Overall */}
        <div className="mt-4 rounded-xl bg-slate-900/60 p-5">
          <label htmlFor="overall-feedback" className="mb-1 block text-xs font-semibold text-slate-400">
            Overall feedback (included in the result email)
          </label>
          <textarea
            id="overall-feedback"
            className="input-field"
            rows="3"
            placeholder="Summary of how they did and what to work on next."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
            <p className="text-sm text-slate-300">
              Projected total:{" "}
              <b className="text-white">
                {projectedTotal}/{attempt.maxPoints}
              </b>{" "}
              <span className="text-german-gold">({projectedPercent}%)</span>
            </p>
            <button
              type="button"
              onClick={submitGrade}
              disabled={busy || !allScored}
              className="btn btn-gold !py-2.5 text-sm disabled:opacity-40"
            >
              {busy ? "Saving…" : "Submit grade & email student"}
            </button>
          </div>
          {!allScored && (
            <p className="mt-2 text-xs text-yellow-400">
              Give every recording a score before submitting.
            </p>
          )}
        </div>

        {status.message && (
          <p
            className={`mt-4 rounded-xl p-4 text-sm ${
              status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    );
  }

  // ---------------- the queue ----------------
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
          🎤 Awaiting review ({queue.length})
        </h3>
        <button
          type="button"
          onClick={loadQueue}
          className="rounded-full bg-slate-700 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-600"
        >
          ↻ Refresh
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Spoken answers can't be auto-scored. Listen to each recording, score it, and the student gets an email
        with your feedback.
      </p>

      {loading && <p className="mt-4 text-sm text-slate-400">Loading queue…</p>}
      {detailLoading && <p className="mt-4 text-sm text-slate-400">Opening attempt…</p>}

      {!loading && queue.length === 0 && (
        <p className="mt-4 rounded-xl bg-slate-900/60 p-5 text-sm text-slate-400">
          Nothing to grade right now. Submitted oral assessments appear here automatically.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {queue.map((attempt) => (
          <div
            key={attempt.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900/60 p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">{attempt.name || attempt.email}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {attempt.courseTitle} · {attempt.email}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Submitted {formatWhen(attempt.submittedAt)} · auto-scored {attempt.autoPoints}/{attempt.maxPoints}
              </p>
            </div>
            <button
              type="button"
              onClick={() => open(attempt.id)}
              className="shrink-0 rounded-full bg-german-gold px-4 py-2 text-xs font-bold text-slate-900 hover:opacity-90"
            >
              🎧 Listen &amp; grade
            </button>
          </div>
        ))}
      </div>

      {status.message && (
        <p
          className={`mt-4 rounded-xl p-4 text-sm ${
            status.type === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
