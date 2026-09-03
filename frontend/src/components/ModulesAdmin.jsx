// ============================================================
// Admin Panel → 📚 Modules
// Pick a course, then add / edit / reorder / delete its modules.
// Students tick these off in "My Learning", and the assessment
// unlocks once every module is ticked.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import api from "../api";
import FileOrLinkInput from "./FileOrLinkInput";

const EMPTY_MODULE = { title: "", summary: "", content: "", durationLabel: "", resourceUrl: "", videoUrl: "" };

export default function ModulesAdmin({ courses = [] }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [draft, setDraft] = useState(EMPTY_MODULE);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setStatus({ type: "", message: "" });
    try {
      const { modules: list } = await api.admin.getModules(id);
      setModules(list || []);
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

  /** Swaps a module with its neighbour and persists the whole ordering. */
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= modules.length) return;
    const reordered = [...modules];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setModules(reordered); // optimistic, so the arrows feel instant
    run(
      () => api.admin.reorderModules(courseId, reordered.map((m) => m.id)),
      "✅ Order saved."
    );
  };

  const fields = (form, setForm, compact = false) => {
    const size = compact ? "!py-2 text-xs" : "";
    return (
      <>
        <input
          className={`input-field sm:col-span-2 ${size}`}
          placeholder="Module title * (e.g. Articles & Noun Genders)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <input
          className={`input-field sm:col-span-2 ${size}`}
          placeholder="One-line summary (shown under the title)"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
        <textarea
          className={`input-field sm:col-span-2 ${size}`}
          rows="2"
          placeholder="What the student should study in this module"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
        <input
          className={`input-field ${size}`}
          placeholder="Duration (e.g. 45 min)"
          value={form.durationLabel}
          onChange={(e) => setForm({ ...form, durationLabel: e.target.value })}
        />
        <input
          className={`input-field ${size}`}
          placeholder="Resource link (PDF / notes, optional)"
          value={form.resourceUrl}
          onChange={(e) => setForm({ ...form, resourceUrl: e.target.value })}
        />
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-semibold text-slate-400">
            🎬 Lesson video (optional) — YouTube link or upload from your device
          </p>
          <FileOrLinkInput
            value={form.videoUrl}
            onChange={(url) => setForm({ ...form, videoUrl: url })}
            placeholder="YouTube / video URL (e.g. https://youtu.be/…)"
            accept="video/*"
          />
        </div>
      </>
    );
  };

  return (
    <div>
      {/* Course picker */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="modules-course" className="mb-1 block text-xs font-bold uppercase tracking-wider text-german-gold">
            Course
          </label>
          <select
            id="modules-course"
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
        <button
          type="button"
          onClick={() => {
            setShowNew((v) => !v);
            setEditingId(null);
            setDraft(EMPTY_MODULE);
          }}
          className="rounded-full bg-german-gold px-4 py-2.5 text-xs font-bold text-slate-900 hover:opacity-90"
        >
          {showNew ? "✕ Cancel" : "+ New Module"}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Students must tick every module before the course assessment unlocks.
      </p>

      {/* Create */}
      {showNew && (
        <form
          className="mt-4 grid gap-3 rounded-xl bg-slate-900/60 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.admin.addModule(courseId, draft);
              setDraft(EMPTY_MODULE);
              setShowNew(false);
            }, "✅ Module added.");
          }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">New module</p>
          {fields(draft, setDraft)}
          <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy || !draft.title.trim()}>
            {busy ? "Adding…" : "Add Module"}
          </button>
        </form>
      )}

      {/* List */}
      <div className="mt-5 space-y-3">
        {loading && <p className="text-sm text-slate-400">Loading modules…</p>}

        {!loading && modules.length === 0 && (
          <p className="rounded-xl bg-slate-900/60 p-5 text-sm text-slate-400">
            No modules for this course yet. Use <b>+ New Module</b> to add the first one.
          </p>
        )}

        {modules.map((module, index) => (
          <div key={module.id} className="rounded-xl bg-slate-900/60 p-4">
            {editingId === module.id ? (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api.admin.updateModule(module.id, editForm);
                    setEditingId(null);
                    setEditForm(null);
                  }, "✅ Module updated.");
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-german-gold sm:col-span-2">
                  Editing module {index + 1}
                </p>
                {fields(editForm, setEditForm, true)}
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
                  <p className="text-sm font-bold text-white">
                    <span className="mr-2 rounded bg-german-gold/20 px-2 py-0.5 text-xs text-german-gold">
                      {index + 1}
                    </span>
                    {module.title}
                  </p>
                  {module.summary && <p className="mt-1 text-xs text-slate-400">{module.summary}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {module.durationLabel || "no duration set"}
                    {module.videoUrl && (
                      <a
                        href={module.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-german-gold underline"
                      >
                        🎬 video
                      </a>
                    )}
                    {module.resourceUrl && (
                      <a
                        href={module.resourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-german-gold underline"
                      >
                        🔗 resource
                      </a>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label="Move up"
                    className="h-8 w-8 rounded-full bg-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-600 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={busy || index === modules.length - 1}
                    aria-label="Move down"
                    className="h-8 w-8 rounded-full bg-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-600 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(module.id);
                      setEditForm({
                        title: module.title,
                        summary: module.summary,
                        content: module.content,
                        durationLabel: module.durationLabel,
                        resourceUrl: module.resourceUrl,
                        videoUrl: module.videoUrl || ""
                      });
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
                      if (
                        window.confirm(
                          `Delete module "${module.title}"?\n\nStudents' completion ticks for it are removed too.`
                        )
                      ) {
                        run(() => api.admin.deleteModule(module.id), "🗑️ Module deleted.");
                      }
                    }}
                    className="rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            )}
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
