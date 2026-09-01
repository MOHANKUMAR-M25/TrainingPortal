// ============================================================
// FileOrLinkInput — reusable admin input that accepts either a
// pasted URL (link) or a file uploaded from the local device.
// Calls onChange(url) whenever a valid URL is available.
// ============================================================

import { useRef, useState } from "react";
import api from "../api";

export default function FileOrLinkInput({
  value = "",
  onChange,
  placeholder = "Paste a URL or upload from your device",
  accept = "image/*", // "image/*" | "video/*"
  className = ""
}) {
  const [mode, setMode] = useState("link"); // "link" | "upload"
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await api.admin.uploadFile(file);
      onChange(result.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            mode === "link" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
          }`}
        >
          🔗 Use Link
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
            mode === "upload" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
          }`}
        >
          📁 Upload from Device
        </button>
      </div>

      {mode === "link" ? (
        <input
          className="input-field mt-2"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-xl border-2 border-dashed border-slate-600 bg-slate-900 px-3 py-4 text-sm text-slate-300 transition hover:border-german-gold hover:text-white disabled:opacity-50"
          >
            {uploading
              ? "⏳ Uploading…"
              : value
              ? "✅ File uploaded — click to replace"
              : `📁 Choose ${accept.startsWith("video") ? "a video" : "an image"} from your device`}
          </button>
          {value && <p className="mt-1 truncate text-xs text-slate-400">Saved at: {value}</p>}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
