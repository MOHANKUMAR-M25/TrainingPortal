import { useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

export default function Videos({ videos, onContentChanged }) {
  const { isAdmin } = useAuth();
  const [playing, setPlaying] = useState(null);
  const [editing, setEditing] = useState(null); // { id, title, description, youtubeId, videoUrl, mode }
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  if (!videos?.length) return null;

  const saveEdit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: editing.title,
        description: editing.description
      };
      if (editing.mode === "youtube") {
        payload.youtubeId = editing.youtubeId;
      } else {
        payload.videoUrl = editing.videoUrl;
      }
      await api.admin.updateVideo(editing.id, payload);
      setEditing(null);
      onContentChanged?.();
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
      setEditing((prev) => ({ ...prev, videoUrl: result.url, mode: "file" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section id="videos" className="bg-slate-900 py-16 sm:py-20">
      <div className="container-site">
        <h2 className="section-title !text-white">
          Free <span>Video Lessons</span>
        </h2>
        <p className="section-subtitle !text-slate-400">
          Get a taste of my teaching style with these free lessons.
        </p>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="group relative overflow-hidden rounded-2xl bg-slate-800 shadow-lg">
              {/* Admin edit icon */}
              {isAdmin && editing?.id !== v.id && (
                <button
                  type="button"
                  title="Edit video"
                  aria-label={`Edit ${v.title}`}
                  onClick={() =>
                    setEditing({
                      id: v.id,
                      title: v.title,
                      description: v.description,
                      youtubeId: v.youtubeId || "",
                      videoUrl: v.videoUrl || "",
                      mode: v.videoUrl ? "file" : "youtube"
                    })
                  }
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

              {/* Edit form overlay */}
              {isAdmin && editing?.id === v.id ? (
                <div className="space-y-2 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-german-gold">✏️ Edit Video</p>
                  <input
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-german-gold"
                    placeholder="Video title"
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />

                  {/* Source switch: YouTube / Link / Upload from device */}
                  <div className="flex gap-1 rounded-lg bg-slate-900 p-1">
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, mode: "youtube" })}
                      className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                        editing.mode === "youtube" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      ▶ YouTube
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, mode: "file" })}
                      className={`flex-1 rounded-md py-1 text-xs font-semibold transition ${
                        editing.mode === "file" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      🔗 Link / 📁 Upload
                    </button>
                  </div>

                  {editing.mode === "youtube" ? (
                    <input
                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-german-gold"
                      placeholder="YouTube video ID (e.g. dQw4w9WgXcQ)"
                      value={editing.youtubeId}
                      onChange={(e) => setEditing({ ...editing, youtubeId: e.target.value })}
                    />
                  ) : (
                    <>
                      <input
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-german-gold"
                        placeholder="Direct video URL (mp4/webm) or upload below"
                        value={editing.videoUrl}
                        onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value })}
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => handleFile(e.target.files?.[0])}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full rounded-lg border-2 border-dashed border-slate-600 bg-slate-900 px-3 py-2.5 text-xs text-slate-300 transition hover:border-german-gold hover:text-white disabled:opacity-50"
                      >
                        {uploading ? "⏳ Uploading video…" : "📁 Upload video from your device"}
                      </button>
                    </>
                  )}

                  <textarea
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-german-gold"
                    rows="2"
                    placeholder="Description"
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                  {editing.mode === "youtube" && editing.youtubeId && (
                    <img
                      src={`https://img.youtube.com/vi/${editing.youtubeId}/hqdefault.jpg`}
                      alt="Thumbnail preview"
                      className="max-h-28 w-full rounded-lg object-cover"
                    />
                  )}
                  {editing.mode === "file" && editing.videoUrl && (
                    <video src={editing.videoUrl} className="max-h-28 w-full rounded-lg object-cover" muted />
                  )}
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={busy || uploading}
                      className="flex-1 rounded-full bg-german-gold py-1.5 text-xs font-bold text-slate-900 hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setError("");
                      }}
                      className="flex-1 rounded-full bg-slate-700 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative aspect-video">
                    {playing === v.id ? (
                      v.videoUrl ? (
                        <video className="h-full w-full object-cover" src={v.videoUrl} controls autoPlay />
                      ) : (
                        <iframe
                          className="h-full w-full"
                          src={`https://www.youtube.com/embed/${v.youtubeId}?autoplay=1`}
                          title={v.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )
                    ) : (
                      <button
                        className="relative h-full w-full"
                        onClick={() => setPlaying(v.id)}
                        aria-label={`Play ${v.title}`}
                      >
                        {v.thumbnail ? (
                          <img
                            src={v.thumbnail}
                            alt={v.title}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : v.videoUrl ? (
                          <video
                            src={v.videoUrl}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-700 text-5xl">🎬</div>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/10">
                          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-german-red text-white shadow-xl">
                            <svg className="ml-1 h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-base font-bold text-white">{v.title}</h3>
                    <p className="mt-2 text-sm text-slate-400">{v.description}</p>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
