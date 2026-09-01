// ============================================================
// EditableImage — wraps any image on the site with an in-place
// ✏️ edit icon that appears ONLY for signed-in admins.
// Clicking the icon opens a small popover where the admin can
// either paste an image URL (link) OR upload a file from their
// local device (with live preview) — saved via the admin API.
// ============================================================

import { useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

export default function EditableImage({
  src,
  alt = "",
  className = "",
  imgClassName = "",
  onSave, // async (newUrl) => void — performs the API call
  label = "image"
}) {
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState("link"); // "link" | "upload"
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const save = async () => {
    if (!url) return;
    setBusy(true);
    setError("");
    try {
      await onSave(url);
      setEditing(false);
      setUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await api.admin.uploadFile(file);
      setUrl(result.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`group/edit relative ${className}`}>
      <img src={src} alt={alt} className={imgClassName} loading="lazy" />

      {/* Edit icon — admins only */}
      {isAdmin && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setUrl(src || "");
            setMode("link");
            setEditing(true);
          }}
          title={`Edit ${label}`}
          aria-label={`Edit ${label}`}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition hover:bg-german-red"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
            />
          </svg>
        </button>
      )}

      {/* Edit popover */}
      {isAdmin && editing && (
        <div
          className="absolute inset-x-2 top-2 z-20 rounded-xl bg-slate-900/95 p-3 shadow-2xl backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-german-gold">✏️ Edit {label}</p>

          {/* Mode switch: Link vs Upload from device */}
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setMode("link")}
              className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                mode === "link" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              🔗 Link
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                mode === "upload" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
              }`}
            >
              📁 Upload
            </button>
          </div>

          {mode === "link" ? (
            <input
              className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-german-gold"
              placeholder="New image URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-lg border-2 border-dashed border-slate-600 bg-slate-800 px-3 py-3 text-xs text-slate-300 transition hover:border-german-gold hover:text-white disabled:opacity-50"
              >
                {uploading ? "⏳ Uploading…" : "📁 Choose image from your device"}
              </button>
            </div>
          )}

          {url && url !== src && (
            <img src={url} alt="Preview" className="mt-2 max-h-24 rounded-lg object-cover" />
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || uploading || !url}
              className="flex-1 rounded-full bg-german-gold py-1.5 text-xs font-bold text-slate-900 hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="flex-1 rounded-full bg-slate-700 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
