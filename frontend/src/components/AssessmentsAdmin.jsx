// ============================================================
// Admin Panel → 📝 Assessments
// Per course: assessment settings plus the question list.
//
//   written -> mcq / multi / text, auto-scored
//   oral    -> mic answers, scored by Meenu in the Grading tab
//
// Correct answers live only here and on the server; the student
// player never receives them.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";

const EMPTY_SETTINGS = {
  title: "Course Assessment",
  description: "",
  format: "written",
  passPercent: 60,
  timeLimitMinutes: "",
  maxAttempts: "",
  active: true
};

const EMPTY_QUESTION = {
  type: "mcq",
  prompt: "",
  helperText: "",
  options: ["", ""],
  correctOptions: [],
  acceptedAnswers: "",
  points: 1,
  prepSeconds: 15,
  maxSeconds: 90
};

const TYPE_LABELS = {
  mcq: "Multiple choice (one answer)",
  multi: "Multi-select (choose all)",
  text: "Fill in the blank",
  oral: "🎤 Spoken answer"
};

function questionToForm(question) {
  return {
    type: question.type,
    prompt: question.prompt,
    helperText: question.helperText || "",
    options: question.options?.length ? question.options : ["", ""],
    correctOptions: question.correctOptions || [],
    acceptedAnswers: (question.acceptedAnswers || []).join(", "),
    points: question.points,
    prepSeconds: question.prepSeconds,
    maxSeconds: question.maxSeconds
  };
}

function formToPayload(form) {
  const payload = {
    type: form.type,
    prompt: form.prompt,
    helperText: form.helperText,
    points: Number(form.points) || 1
  };

  if (form.type === "mcq" || form.type === "multi") {
    payload.options = form.options.map((o) => o.trim()).filter(Boolean);
    payload.correctOptions = form.correctOptions;
  }
  if (form.type === "text") {
    payload.acceptedAnswers = String(form.acceptedAnswers || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  if (form.type === "oral") {
    payload.prepSeconds = Number(form.prepSeconds) || 0;
    payload.maxSeconds = Number(form.maxSeconds) || 90;
  }
  return payload;
}

/** Shared editor for a new or existing question. */
function QuestionFields({ form, setForm }) {
  const setOption = (index, value) => {
    const options = [...form.options];
    options[index] = value;
    setForm({ ...form, options });
  };

  const removeOption = (index) => {
    const options = form.options.filter((_, i) => i !== index);
    // Correct-answer indices shift when an earlier option disappears.
    const correctOptions = form.correctOptions
      .filter((n) => n !== index)
      .map((n) => (n > index ? n - 1 : n));
    setForm({ ...form, options, correctOptions });
  };

  const toggleCorrect = (index) => {
    if (form.type === "mcq") {
      setForm({ ...form, correctOptions: [index] }); // exactly one
      return;
    }
    setForm({
      ...form,
      correctOptions: form.correctOptions.includes(index)
        ? form.correctOptions.filter((n) => n !== index)
        : [...form.correctOptions, index]
    });
  };

  const needsOptions = form.type === "mcq" || form.type === "multi";

  return (
    <>
      <select
        className="input-field !py-2 text-xs"
        value={form.type}
        onChange={(e) => setForm({ ...form, type: e.target.value, correctOptions: [] })}
      >
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="input-field !py-2 text-xs"
        type="number"
        min="1"
        placeholder="Points"
        value={form.points}
        onChange={(e) => setForm({ ...form, points: e.target.value })}
      />

      <textarea
        className="input-field !py-2 text-xs sm:col-span-2"
        rows="2"
        placeholder="Question prompt *"
        value={form.prompt}
        onChange={(e) => setForm({ ...form, prompt: e.target.value })}
        required
      />
      <input
        className="input-field !py-2 text-xs sm:col-span-2"
        placeholder="Hint shown under the prompt (optional)"
        value={form.helperText}
        onChange={(e) => setForm({ ...form, helperText: e.target.value })}
      />

      {needsOptions && (
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-semibold text-slate-400">
            Options — tap the circle to mark {form.type === "mcq" ? "the correct answer" : "every correct answer"}
          </p>
          <div className="space-y-1.5">
            {form.options.map((option, index) => {
              const correct = form.correctOptions.includes(index);
              return (
                <div key={index} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(index)}
                    aria-label={`Mark option ${index + 1} correct`}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                      correct ? "border-green-500 bg-green-500 text-white" : "border-slate-600 text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <input
                    className="input-field !py-2 text-xs"
                    placeholder={`Option ${index + 1}`}
                    value={option}
                    onChange={(e) => setOption(index, e.target.value)}
                  />
                  {form.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label={`Remove option ${index + 1}`}
                      className="h-7 w-7 shrink-0 rounded-full bg-red-600/70 text-xs font-bold text-white hover:bg-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, options: [...form.options, ""] })}
            className="mt-2 text-xs font-semibold text-german-gold underline"
          >
            + Add option
          </button>
        </div>
      )}

      {form.type === "text" && (
        <div className="sm:col-span-2">
          <input
            className="input-field !py-2 text-xs"
            placeholder="Accepted answers, comma-separated (e.g. heiße, heisse)"
            value={form.acceptedAnswers}
            onChange={(e) => setForm({ ...form, acceptedAnswers: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Matching ignores case and folds umlauts (ü = ue), so you don't need both spellings — but extra
            variants are fine.
          </p>
        </div>
      )}

      {form.type === "oral" && (
        <>
          <input
            className="input-field !py-2 text-xs"
            type="number"
            min="0"
            placeholder="Thinking time (seconds)"
            value={form.prepSeconds}
            onChange={(e) => setForm({ ...form, prepSeconds: e.target.value })}
          />
          <input
            className="input-field !py-2 text-xs"
            type="number"
            min="5"
            placeholder="Max recording length (seconds)"
            value={form.maxSeconds}
            onChange={(e) => setForm({ ...form, maxSeconds: e.target.value })}
          />
          <p className="text-[11px] text-slate-500 sm:col-span-2">
            🎤 Spoken answers can't be auto-scored — they appear in the <b>Grading</b> tab for you to listen to
            and score.
          </p>
        </>
      )}
    </>
  );
}

export default function AssessmentsAdmin({ courses = [] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [assessment, setAssessment] = useState(null);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [draft, setDraft] = useState(EMPTY_QUESTION);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const { assessment: found } = await api.admin.getAssessment(id);
      setAssessment(found);
      setSettings(
        found
          ? {
              title: found.title,
              description: found.description,
              format: found.format,
              passPercent: found.passPercent,
              timeLimitMinutes: found.timeLimitMinutes ?? "",
              maxAttempts: found.maxAttempts ?? "",
              active: found.active
            }
          : EMPTY_SETTINGS
      );
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(courseId);
  }, [courseId, load]);

  const run = async (fn, successMessage) => {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await fn();
      await load(courseId);
      setStatus({ type: "success", message: successMessage });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const totalPoints = (assessment?.questions || []).reduce((sum, q) => sum + Number(q.points || 0), 0);

  return (
    <div>
      {/* Course picker */}
      <div className="min-w-[240px] max-w-md">
        <label htmlFor="assess-course" className="mb-1 block text-xs font-bold uppercase tracking-wider text-german-gold">
          Course
        </label>
        <select
          id="assess-course"
          className="input-field"
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setEditingId(null);
            setShowNew(false);
          }}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.level} · {c.title}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-400">Loading assessment…</p>}

      {!loading && (
        <>
          {/* Settings */}
          <form
            className="mt-5 grid gap-3 rounded-xl bg-slate-900/60 p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => api.admin.saveAssessment(courseId, settings),
                assessment ? "✅ Assessment settings saved." : "✅ Assessment created — now add questions."
              );
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
              {assessment ? "Assessment settings" : "Create an assessment for this course"}
            </p>

            <input
              className="input-field sm:col-span-2"
              placeholder="Assessment title *"
              value={settings.title}
              onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              required
            />
            <textarea
              className="input-field sm:col-span-2"
              rows="2"
              placeholder="Instructions shown before starting"
              value={settings.description}
              onChange={(e) => setSettings({ ...settings, description: e.target.value })}
            />

            <div>
              <label htmlFor="assess-format" className="mb-1 block text-xs font-semibold text-slate-400">
                Format
              </label>
              <select
                id="assess-format"
                className="input-field"
                value={settings.format}
                onChange={(e) => setSettings({ ...settings, format: e.target.value })}
              >
                <option value="written">📝 Written (auto-scored)</option>
                <option value="oral">🎤 Oral (you score the recordings)</option>
              </select>
            </div>
            <div>
              <label htmlFor="assess-pass" className="mb-1 block text-xs font-semibold text-slate-400">
                Pass mark (%)
              </label>
              <input
                id="assess-pass"
                className="input-field"
                type="number"
                min="0"
                max="100"
                value={settings.passPercent}
                onChange={(e) => setSettings({ ...settings, passPercent: e.target.value })}
              />
            </div>
            <input
              className="input-field"
              type="number"
              min="1"
              placeholder="Time limit in minutes (blank = untimed)"
              value={settings.timeLimitMinutes}
              onChange={(e) => setSettings({ ...settings, timeLimitMinutes: e.target.value })}
            />
            <input
              className="input-field"
              type="number"
              min="1"
              placeholder="Max attempts (blank = unlimited)"
              value={settings.maxAttempts}
              onChange={(e) => setSettings({ ...settings, maxAttempts: e.target.value })}
            />

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-german-gold"
                checked={settings.active}
                onChange={(e) => setSettings({ ...settings, active: e.target.checked })}
              />
              Published — students can see and take this assessment
            </label>

            <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
              {busy ? "Saving…" : assessment ? "Save Settings" : "Create Assessment"}
            </button>
          </form>

          {/* Questions */}
          {assessment && (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                  Questions ({assessment.questions?.length || 0}) · {totalPoints} points
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNew((v) => !v);
                      setEditingId(null);
                      // Default to a spoken question on an oral assessment.
                      setDraft({ ...EMPTY_QUESTION, type: assessment.format === "oral" ? "oral" : "mcq" });
                    }}
                    className="rounded-full bg-german-gold px-4 py-2 text-xs font-bold text-slate-900 hover:opacity-90"
                  >
                    {showNew ? "✕ Cancel" : "+ New Question"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete the whole assessment for this course?\n\nAll questions AND every student attempt and recording are deleted too. This cannot be undone.`
                        )
                      ) {
                        run(() => api.admin.deleteAssessment(courseId), "🗑️ Assessment deleted.");
                      }
                    }}
                    className="rounded-full bg-red-600/80 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    🗑 Delete assessment
                  </button>
                </div>
              </div>

              {showNew && (
                <form
                  className="mt-3 grid gap-3 rounded-xl bg-slate-900/60 p-5 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api.admin.addQuestion(courseId, formToPayload(draft));
                      setShowNew(false);
                    }, "✅ Question added.");
                  }}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
                    New question
                  </p>
                  <QuestionFields form={draft} setForm={setDraft} />
                  <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy || !draft.prompt.trim()}>
                    {busy ? "Adding…" : "Add Question"}
                  </button>
                </form>
              )}

              <div className="mt-3 space-y-3">
                {(assessment.questions || []).length === 0 && (
                  <p className="rounded-xl bg-slate-900/60 p-5 text-sm text-slate-400">
                    No questions yet — students can't take this assessment until you add at least one.
                  </p>
                )}

                {(assessment.questions || []).map((question, index) => (
                  <div key={question.id} className="rounded-xl bg-slate-900/60 p-4">
                    {editingId === question.id ? (
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(async () => {
                            await api.admin.updateQuestion(question.id, formToPayload(editForm));
                            setEditingId(null);
                            setEditForm(null);
                          }, "✅ Question updated.");
                        }}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
                          Editing question {index + 1}
                        </p>
                        <QuestionFields form={editForm} setForm={setEditForm} />
                        <div className="flex gap-2 sm:col-span-2">
                          <button className="btn btn-gold flex-1 !py-2 text-xs disabled:opacity-60" disabled={busy}>
                            {busy ? "Saving…" : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="flex-1 rounded-full bg-slate-700 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded bg-german-gold/20 px-2 py-0.5 font-bold text-german-gold">
                              {index + 1}
                            </span>
                            <span className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-300">
                              {TYPE_LABELS[question.type]}
                            </span>
                            <span className="text-slate-500">
                              {question.points} pt{question.points === 1 ? "" : "s"}
                            </span>
                          </p>
                          <p className="mt-2 text-sm font-semibold text-white">{question.prompt}</p>

                          {/* Answer key — admin-only */}
                          {(question.type === "mcq" || question.type === "multi") && (
                            <ul className="mt-2 space-y-0.5">
                              {question.options.map((option, optionIndex) => (
                                <li
                                  key={option}
                                  className={`text-xs ${
                                    question.correctOptions.includes(optionIndex)
                                      ? "font-bold text-green-400"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {question.correctOptions.includes(optionIndex) ? "✓" : "○"} {option}
                                </li>
                              ))}
                            </ul>
                          )}
                          {question.type === "text" && (
                            <p className="mt-2 text-xs text-green-400">
                              Accepts: <b>{question.acceptedAnswers.join(" / ")}</b>
                            </p>
                          )}
                          {question.type === "oral" && (
                            <p className="mt-2 text-xs text-slate-400">
                              🎤 {question.prepSeconds}s prep · up to {question.maxSeconds}s recording
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(question.id);
                              setEditForm(questionToForm(question));
                              setShowNew(false);
                            }}
                            className="rounded-full bg-german-gold px-4 py-1.5 text-xs font-bold text-slate-900 hover:opacity-90"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm("Delete this question?")) {
                                run(() => api.admin.deleteQuestion(question.id), "🗑️ Question deleted.");
                              }
                            }}
                            className="rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

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
