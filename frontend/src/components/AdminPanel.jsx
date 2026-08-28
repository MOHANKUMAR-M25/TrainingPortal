// ============================================================
// Admin Panel — visible ONLY to the trainer (meenupkc@gmail.com)
// after Google sign-in. Lets her add student reviews, videos
// and training images in real-time.
// ============================================================

import { useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

const TABS = ["Review", "Testimonial", "Video", "Image"];

export default function AdminPanel({ onContentChanged }) {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState("Review");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);

  const [review, setReview] = useState({ name: "", country: "", rating: "5", course: "", text: "" });
  const [testimonial, setTestimonial] = useState({ name: "", role: "", text: "", photo: "" });
  const [video, setVideo] = useState({ title: "", description: "", youtubeId: "" });
  const [image, setImage] = useState({ title: "", url: "" });

  if (!isAdmin) return null;

  const submit = async (fn, reset) => {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await fn();
      setStatus({ type: "success", message: "✅ Added! The website has been updated in real-time." });
      reset();
      onContentChanged?.();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="admin" className="border-y-4 border-german-gold bg-slate-900 py-14">
      <div className="container-site">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              🔐 Trainer Admin Panel
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Signed in as <span className="font-semibold text-german-gold">{user.email}</span> — you can edit the
              website content below. Visitors cannot see this panel.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setStatus({ type: "", message: "" });
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-german-gold text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              + Add {t}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-slate-800 p-6">
          {/* Add Review */}
          {tab === "Review" && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(
                  () => api.admin.addReview(review),
                  () => setReview({ name: "", country: "", rating: "5", course: "", text: "" })
                );
              }}
            >
              <input className="input-field" placeholder="Student name *" value={review.name} onChange={(e) => setReview({ ...review, name: e.target.value })} required />
              <input className="input-field" placeholder="Country" value={review.country} onChange={(e) => setReview({ ...review, country: e.target.value })} />
              <select className="input-field" value={review.rating} onChange={(e) => setReview({ ...review, rating: e.target.value })}>
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>{"★".repeat(r)} ({r}/5)</option>
                ))}
              </select>
              <input className="input-field" placeholder="Course taken" value={review.course} onChange={(e) => setReview({ ...review, course: e.target.value })} />
              <textarea className="input-field sm:col-span-2" rows="3" placeholder="Review text *" value={review.text} onChange={(e) => setReview({ ...review, text: e.target.value })} required />
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
                {busy ? "Adding…" : "Publish Review"}
              </button>
            </form>
          )}

          {/* Add Testimonial */}
          {tab === "Testimonial" && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(
                  () => api.admin.addTestimonial(testimonial),
                  () => setTestimonial({ name: "", role: "", text: "", photo: "" })
                );
              }}
            >
              <input className="input-field" placeholder="Name *" value={testimonial.name} onChange={(e) => setTestimonial({ ...testimonial, name: e.target.value })} required />
              <input className="input-field" placeholder="Role (e.g. Engineer, Berlin)" value={testimonial.role} onChange={(e) => setTestimonial({ ...testimonial, role: e.target.value })} />
              <input className="input-field sm:col-span-2" placeholder="Photo URL (optional)" value={testimonial.photo} onChange={(e) => setTestimonial({ ...testimonial, photo: e.target.value })} />
              <textarea className="input-field sm:col-span-2" rows="3" placeholder="Testimonial text *" value={testimonial.text} onChange={(e) => setTestimonial({ ...testimonial, text: e.target.value })} required />
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
                {busy ? "Adding…" : "Publish Testimonial"}
              </button>
            </form>
          )}

          {/* Add Video */}
          {tab === "Video" && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(
                  () => api.admin.addVideo(video),
                  () => setVideo({ title: "", description: "", youtubeId: "" })
                );
              }}
            >
              <input className="input-field" placeholder="Video title *" value={video.title} onChange={(e) => setVideo({ ...video, title: e.target.value })} required />
              <input className="input-field" placeholder="YouTube video ID * (e.g. dQw4w9WgXcQ)" value={video.youtubeId} onChange={(e) => setVideo({ ...video, youtubeId: e.target.value })} required />
              <textarea className="input-field sm:col-span-2" rows="2" placeholder="Description" value={video.description} onChange={(e) => setVideo({ ...video, description: e.target.value })} />
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
                {busy ? "Adding…" : "Publish Video"}
              </button>
            </form>
          )}

          {/* Add Image */}
          {tab === "Image" && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(
                  () => api.admin.addImage(image),
                  () => setImage({ title: "", url: "" })
                );
              }}
            >
              <input className="input-field" placeholder="Image caption" value={image.title} onChange={(e) => setImage({ ...image, title: e.target.value })} />
              <input className="input-field" placeholder="Image URL *" value={image.url} onChange={(e) => setImage({ ...image, url: e.target.value })} required />
              {image.url && (
                <img src={image.url} alt="Preview" className="max-h-40 rounded-xl object-cover sm:col-span-2" />
              )}
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
                {busy ? "Adding…" : "Publish Image"}
              </button>
            </form>
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
      </div>
    </section>
  );
}
