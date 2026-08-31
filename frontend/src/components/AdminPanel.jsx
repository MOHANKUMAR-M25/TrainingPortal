// ============================================================
// Admin Panel — visible ONLY to whitelisted admins after
// Google sign-in. Lets admins add student reviews, videos
// and training images in real-time, edit/delete existing
// gallery images, update the profile photo, and manage
// (add/remove) other admins. All image/video inputs accept
// either a link (URL) or an upload from the local device.
// ============================================================

import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import FileOrLinkInput from "./FileOrLinkInput";

const TABS = ["Course", "Review", "Testimonial", "Video", "Image", "Manage Images", "Manage Courses", "Manage Admins"];

const EMPTY_COURSE = {
  level: "",
  title: "",
  description: "",
  duration: "",
  mode: "Live Online (Zoom)",
  price: "",
  features: "",
  externalLink: ""
};

export default function AdminPanel({ gallery = [], trainer, testimonials = [], courses = [], onContentChanged }) {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState("Review");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);

  const [review, setReview] = useState({ name: "", country: "", rating: "5", course: "", text: "" });
  const [testimonial, setTestimonial] = useState({ name: "", role: "", text: "", photo: "" });
  const [video, setVideo] = useState({ title: "", description: "", youtubeId: "", videoUrl: "", source: "youtube" });
  const [image, setImage] = useState({ title: "", url: "" });
  const [editingImage, setEditingImage] = useState(null); // { id, title, url }
  const [editingTestimonialPhoto, setEditingTestimonialPhoto] = useState(null); // { id, photo }
  const [trainerPhoto, setTrainerPhoto] = useState("");
  const [course, setCourse] = useState(EMPTY_COURSE);
  const [editingCourse, setEditingCourse] = useState(null);

  // Admin management
  const [admins, setAdmins] = useState([]);
  const [primaryAdmin, setPrimaryAdmin] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");

  useEffect(() => {
    if (isAdmin && tab === "Manage Admins") {
      api.admin
        .getAdmins()
        .then((res) => {
          setAdmins(res.admins || []);
          setPrimaryAdmin(res.primaryAdmin || "");
        })
        .catch((err) => setStatus({ type: "error", message: err.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab]);

  const courseToPayload = (c) => ({
    level: c.level || "NEW",
    title: c.title,
    description: c.description,
    duration: c.duration,
    mode: c.mode,
    price: c.price,
    features: typeof c.features === "string"
      ? c.features.split(",").map((f) => f.trim()).filter(Boolean)
      : c.features || [],
    externalLink: c.externalLink || ""
  });

  if (!isAdmin) return null;

  const submit = async (fn, reset, successMsg = "✅ Added! The website has been updated in real-time.") => {
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await fn();
      setStatus({ type: "success", message: successMsg });
      reset?.();
      onContentChanged?.();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const refreshAdmins = async () => {
    const res = await api.admin.getAdmins();
    setAdmins(res.admins || []);
    setPrimaryAdmin(res.primaryAdmin || "");
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
                setEditingImage(null);
              }}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                tab === t ? "bg-german-gold text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {t === "Manage Images"
                ? "🖼 Manage Images"
                : t === "Manage Courses"
                ? "📚 Manage Courses"
                : t === "Manage Admins"
                ? "👑 Manage Admins"
                : `+ Add ${t}`}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-slate-800 p-6">
          {/* Add Course */}
          {tab === "Course" && (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(
                  () => api.admin.addCourse(courseToPayload(course)),
                  () => setCourse(EMPTY_COURSE),
                  "✅ Course published! It now appears in the Courses section."
                );
              }}
            >
              <input className="input-field" placeholder="Level badge (e.g. A1, B2, EXAM) *" value={course.level} onChange={(e) => setCourse({ ...course, level: e.target.value })} required />
              <input className="input-field" placeholder="Course title *" value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} required />
              <input className="input-field" placeholder="Price in INR (e.g. ₹9,999) *" value={course.price} onChange={(e) => setCourse({ ...course, price: e.target.value })} required />
              <input className="input-field" placeholder="Duration (e.g. 8 weeks · 3 classes/week)" value={course.duration} onChange={(e) => setCourse({ ...course, duration: e.target.value })} />
              <input className="input-field" placeholder="Mode (e.g. Live Online Zoom)" value={course.mode} onChange={(e) => setCourse({ ...course, mode: e.target.value })} />
              <input className="input-field" placeholder="External link (enrollment / syllabus URL)" value={course.externalLink} onChange={(e) => setCourse({ ...course, externalLink: e.target.value })} />
              <textarea className="input-field sm:col-span-2" rows="2" placeholder="Course description *" value={course.description} onChange={(e) => setCourse({ ...course, description: e.target.value })} required />
              <textarea className="input-field sm:col-span-2" rows="2" placeholder="Features (comma-separated, e.g. Live classes, Mock exams, Certificate)" value={course.features} onChange={(e) => setCourse({ ...course, features: e.target.value })} />
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy}>
                {busy ? "Publishing…" : "Publish Course"}
              </button>
            </form>
          )}

          {/* Manage existing courses */}
          {tab === "Manage Courses" && (
            <div className="space-y-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                Courses ({courses.length})
              </h3>
              {courses.map((c) => (
                <div key={c.id} className="rounded-xl bg-slate-900/60 p-4">
                  {editingCourse?.id === c.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="input-field !py-2 text-xs" placeholder="Level" value={editingCourse.level} onChange={(e) => setEditingCourse({ ...editingCourse, level: e.target.value })} />
                      <input className="input-field !py-2 text-xs" placeholder="Title" value={editingCourse.title} onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })} />
                      <input className="input-field !py-2 text-xs" placeholder="Price (INR)" value={editingCourse.price} onChange={(e) => setEditingCourse({ ...editingCourse, price: e.target.value })} />
                      <input className="input-field !py-2 text-xs" placeholder="Duration" value={editingCourse.duration} onChange={(e) => setEditingCourse({ ...editingCourse, duration: e.target.value })} />
                      <input className="input-field !py-2 text-xs sm:col-span-2" placeholder="External link (enrollment / syllabus URL)" value={editingCourse.externalLink || ""} onChange={(e) => setEditingCourse({ ...editingCourse, externalLink: e.target.value })} />
                      <textarea className="input-field !py-2 text-xs sm:col-span-2" rows="2" placeholder="Description" value={editingCourse.description} onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })} />
                      <textarea className="input-field !py-2 text-xs sm:col-span-2" rows="2" placeholder="Features (comma-separated)" value={editingCourse.features} onChange={(e) => setEditingCourse({ ...editingCourse, features: e.target.value })} />
                      <div className="flex gap-2 sm:col-span-2">
                        <button
                          className="btn btn-gold flex-1 !py-2 text-xs disabled:opacity-60"
                          disabled={busy}
                          onClick={() =>
                            submit(
                              () => api.admin.updateCourse(c.id, courseToPayload(editingCourse)),
                              () => setEditingCourse(null),
                              "✅ Course updated!"
                            )
                          }
                        >
                          Save Changes
                        </button>
                        <button
                          className="flex-1 rounded-full bg-slate-700 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-600"
                          onClick={() => setEditingCourse(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">
                          <span className="mr-2 rounded bg-german-gold/20 px-2 py-0.5 text-xs text-german-gold">{c.level}</span>
                          {c.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {c.price} · {c.duration}
                          {c.externalLink && (
                            <a href={c.externalLink} target="_blank" rel="noreferrer" className="ml-2 text-german-gold underline">
                              🔗 external link
                            </a>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="rounded-full bg-german-gold px-4 py-1.5 text-xs font-bold text-slate-900 hover:opacity-90"
                          onClick={() =>
                            setEditingCourse({
                              ...c,
                              features: Array.isArray(c.features) ? c.features.join(", ") : c.features || ""
                            })
                          }
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete course "${c.title}"?`)) {
                              submit(() => api.admin.deleteCourse(c.id), null, "🗑️ Course deleted.");
                            }
                          }}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Manage Admins */}
          {tab === "Manage Admins" && (
            <div>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                👑 Admin Accounts ({admins.length})
              </h3>
              <p className="mt-2 text-xs text-slate-400">
                Admins can edit all website content. Only existing admins can add new admins. New admins sign in with
                their Google account to get edit access.
              </p>

              {/* Add new admin */}
              <form
                className="mt-4 flex flex-wrap gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(
                    async () => {
                      await api.admin.addAdmin(newAdminEmail);
                      await refreshAdmins();
                    },
                    () => setNewAdminEmail(""),
                    `✅ ${newAdminEmail} is now an admin! They can sign in with Google to start editing.`
                  );
                }}
              >
                <input
                  type="email"
                  className="input-field flex-1 min-w-[240px]"
                  placeholder="New admin's Gmail address (e.g. someone@gmail.com)"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  required
                />
                <button className="btn btn-gold disabled:opacity-60" disabled={busy || !newAdminEmail}>
                  {busy ? "Adding…" : "+ Add Admin"}
                </button>
              </form>

              {/* Existing admins list */}
              <div className="mt-6 space-y-2">
                {admins.map((email) => (
                  <div key={email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900/60 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-german-gold/20 text-base">
                        {email === primaryAdmin ? "⭐" : "👤"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{email}</p>
                        <p className="text-xs text-slate-400">
                          {email === primaryAdmin
                            ? "Primary admin (calendar owner) — cannot be removed"
                            : email === user.email
                            ? "You"
                            : "Admin"}
                        </p>
                      </div>
                    </div>
                    {email !== primaryAdmin && email !== user.email && (
                      <button
                        className="rounded-full bg-red-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove admin access for ${email}?`)) {
                            submit(
                              async () => {
                                await api.admin.removeAdmin(email);
                                await refreshAdmins();
                              },
                              null,
                              `${email} is no longer an admin.`
                            );
                          }
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold text-slate-400">Photo (optional) — link or upload:</p>
                <FileOrLinkInput
                  value={testimonial.photo}
                  onChange={(url) => setTestimonial({ ...testimonial, photo: url })}
                  placeholder="Photo URL (optional)"
                  accept="image/*"
                />
              </div>
              {testimonial.photo && (
                <img src={testimonial.photo} alt="Preview" className="max-h-28 rounded-xl object-cover sm:col-span-2" />
              )}
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
                const payload = {
                  title: video.title,
                  description: video.description
                };
                if (video.source === "youtube") payload.youtubeId = video.youtubeId;
                else payload.videoUrl = video.videoUrl;
                submit(
                  () => api.admin.addVideo(payload),
                  () => setVideo({ title: "", description: "", youtubeId: "", videoUrl: "", source: "youtube" })
                );
              }}
            >
              <input className="input-field sm:col-span-2" placeholder="Video title *" value={video.title} onChange={(e) => setVideo({ ...video, title: e.target.value })} required />

              {/* Video source selector */}
              <div className="flex gap-1 rounded-lg bg-slate-900 p-1 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setVideo({ ...video, source: "youtube" })}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                    video.source === "youtube" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
                  }`}
                >
                  ▶ YouTube Video
                </button>
                <button
                  type="button"
                  onClick={() => setVideo({ ...video, source: "file" })}
                  className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                    video.source === "file" ? "bg-german-gold text-slate-900" : "text-slate-300 hover:text-white"
                  }`}
                >
                  🔗 Video Link / 📁 Upload from Device
                </button>
              </div>

              {video.source === "youtube" ? (
                <input
                  className="input-field sm:col-span-2"
                  placeholder="YouTube video ID * (e.g. dQw4w9WgXcQ)"
                  value={video.youtubeId}
                  onChange={(e) => setVideo({ ...video, youtubeId: e.target.value })}
                  required={video.source === "youtube"}
                />
              ) : (
                <FileOrLinkInput
                  className="sm:col-span-2"
                  value={video.videoUrl}
                  onChange={(url) => setVideo({ ...video, videoUrl: url })}
                  placeholder="Direct video URL (mp4/webm)"
                  accept="video/*"
                />
              )}

              {video.source === "file" && video.videoUrl && (
                <video src={video.videoUrl} className="max-h-40 rounded-xl object-cover sm:col-span-2" controls muted />
              )}

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
              <input className="input-field sm:col-span-2" placeholder="Image caption" value={image.title} onChange={(e) => setImage({ ...image, title: e.target.value })} />
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold text-slate-400">Image * — link or upload:</p>
                <FileOrLinkInput
                  value={image.url}
                  onChange={(url) => setImage({ ...image, url })}
                  placeholder="Image URL *"
                  accept="image/*"
                />
              </div>
              {image.url && (
                <img src={image.url} alt="Preview" className="max-h-40 rounded-xl object-cover sm:col-span-2" />
              )}
              <button className="btn btn-gold sm:col-span-2 disabled:opacity-60" disabled={busy || !image.url}>
                {busy ? "Adding…" : "Publish Image"}
              </button>
            </form>
          )}

          {/* Manage existing images (edit / delete) + trainer photo */}
          {tab === "Manage Images" && (
            <div>
              {/* Trainer profile photo */}
              <div className="mb-8 rounded-xl bg-slate-900/60 p-5">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                  Trainer Profile Photo
                </h3>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <img
                    src={trainer?.photo}
                    alt="Current trainer"
                    className="h-24 w-24 rounded-xl object-cover ring-2 ring-german-gold/60"
                  />
                  <div className="flex-1 min-w-[260px]">
                    <FileOrLinkInput
                      value={trainerPhoto}
                      onChange={setTrainerPhoto}
                      placeholder="New photo URL"
                      accept="image/*"
                    />
                    <button
                      className="btn btn-gold mt-3 !py-2 text-sm disabled:opacity-60"
                      disabled={busy || !trainerPhoto}
                      onClick={() =>
                        submit(
                          () => api.admin.updateTrainerPhoto(trainerPhoto),
                          () => setTrainerPhoto(""),
                          "✅ Trainer photo updated!"
                        )
                      }
                    >
                      {busy ? "Updating…" : "Update Photo"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Testimonial photos */}
              <div className="mb-8">
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                  Testimonial Photos ({testimonials.length})
                </h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {testimonials.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-900/60 p-3">
                      <img
                        src={t.photo || "https://via.placeholder.com/80?text=No+Photo"}
                        alt={t.name}
                        className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-german-gold/50"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-200">{t.name}</p>
                        {editingTestimonialPhoto?.id === t.id ? (
                          <div className="mt-1 space-y-1.5">
                            <FileOrLinkInput
                              value={editingTestimonialPhoto.photo}
                              onChange={(url) =>
                                setEditingTestimonialPhoto({ ...editingTestimonialPhoto, photo: url })
                              }
                              placeholder="New photo URL"
                              accept="image/*"
                            />
                            <div className="flex gap-1.5">
                              <button
                                className="flex-1 rounded-full bg-german-gold py-1 text-xs font-bold text-slate-900 disabled:opacity-60"
                                disabled={busy}
                                onClick={() =>
                                  submit(
                                    () => api.admin.updateTestimonial(t.id, { photo: editingTestimonialPhoto.photo }),
                                    () => setEditingTestimonialPhoto(null),
                                    "✅ Testimonial photo updated!"
                                  )
                                }
                              >
                                Save
                              </button>
                              <button
                                className="flex-1 rounded-full bg-slate-700 py-1 text-xs font-semibold text-slate-300"
                                onClick={() => setEditingTestimonialPhoto(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="mt-1 rounded-full bg-german-gold px-3 py-1 text-xs font-bold text-slate-900 hover:opacity-90"
                            onClick={() => setEditingTestimonialPhoto({ id: t.id, photo: t.photo || "" })}
                          >
                            ✏️ Change Photo
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gallery images grid */}
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-german-gold">
                Gallery Images ({gallery.length})
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.map((img) => (
                  <div key={img.id} className="overflow-hidden rounded-xl bg-slate-900/60">
                    <img src={img.url} alt={img.title} className="aspect-video w-full object-cover" />
                    {editingImage?.id === img.id ? (
                      <div className="space-y-2 p-3">
                        <input
                          className="input-field !py-2 text-xs"
                          placeholder="Caption"
                          value={editingImage.title}
                          onChange={(e) => setEditingImage({ ...editingImage, title: e.target.value })}
                        />
                        <FileOrLinkInput
                          value={editingImage.url}
                          onChange={(url) => setEditingImage({ ...editingImage, url })}
                          placeholder="Image URL"
                          accept="image/*"
                        />
                        <div className="flex gap-2">
                          <button
                            className="btn btn-gold flex-1 !py-1.5 text-xs disabled:opacity-60"
                            disabled={busy}
                            onClick={() =>
                              submit(
                                () => api.admin.updateImage(img.id, { title: editingImage.title, url: editingImage.url }),
                                () => setEditingImage(null),
                                "✅ Image updated!"
                              )
                            }
                          >
                            Save
                          </button>
                          <button
                            className="flex-1 rounded-full bg-slate-700 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600"
                            onClick={() => setEditingImage(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3">
                        <p className="truncate text-xs font-medium text-slate-300">{img.title}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            className="flex-1 rounded-full bg-german-gold py-1.5 text-xs font-bold text-slate-900 hover:opacity-90"
                            onClick={() => setEditingImage({ id: img.id, title: img.title, url: img.url })}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="flex-1 rounded-full bg-red-600/80 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Delete image "${img.title}"?`)) {
                                submit(() => api.admin.deleteImage(img.id), null, "🗑️ Image deleted.");
                              }
                            }}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
