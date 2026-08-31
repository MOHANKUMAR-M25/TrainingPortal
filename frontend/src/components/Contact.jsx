import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

export default function Contact({ trainer }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill name & email from the logged-in user's profile
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.name || "",
        email: prev.email || user.email || ""
      }));
    }
  }, [user]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: "", message: "" });
    try {
      const res = await api.sendContact(form);
      setStatus({ type: "success", message: res.message });
      // Keep profile details for signed-in users; reset only subject/message
      setForm({
        name: user?.name || "",
        email: user?.email || "",
        subject: "",
        message: ""
      });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="contact" className="bg-slate-50 py-20">
      <div className="container-site">
        <h2 className="section-title">
          Get in <span>Touch</span>
        </h2>
        <p className="section-subtitle">
          Questions about courses, exams or moving to Germany? Send a message — replies within 24 hours.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-5">
          {/* Contact details */}
          <div className="space-y-4 lg:col-span-2">
            <div className="card flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-german-gold/20 text-xl">📧</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</p>
                <a href={`mailto:${trainer?.email}`} className="text-sm font-medium text-slate-900 hover:text-german-red">
                  {trainer?.email}
                </a>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-german-gold/20 text-xl">📞</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone / WhatsApp</p>
                <p className="text-sm font-medium text-slate-900">{trainer?.phone}</p>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-german-gold/20 text-xl">📍</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</p>
                <p className="text-sm font-medium text-slate-900">{trainer?.location}</p>
              </div>
            </div>
            <div className="card flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-german-gold/20 text-xl">🕘</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Availability</p>
                <p className="text-sm font-medium text-slate-900">Mon–Sat · 9:00–19:00 CET</p>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="card grid gap-4 !p-8 sm:grid-cols-2">
              {user && (
                <p className="rounded-xl bg-green-50 p-3 text-xs text-green-700 sm:col-span-2">
                  ✅ Messaging as <span className="font-bold">{user.name || user.email}</span> — your details are
                  filled in from your profile automatically.
                </p>
              )}
              <input
                className="input-field"
                name="name"
                placeholder="Your name *"
                value={form.name}
                onChange={handleChange}
                required
              />
              <input
                className="input-field"
                name="email"
                type="email"
                placeholder="Your email *"
                value={form.email}
                onChange={handleChange}
                required
              />
              <input
                className="input-field sm:col-span-2"
                name="subject"
                placeholder="Subject"
                value={form.subject}
                onChange={handleChange}
              />
              <textarea
                className="input-field sm:col-span-2"
                name="message"
                rows="5"
                placeholder="Your message *"
                value={form.message}
                onChange={handleChange}
                required
              />
              <button type="submit" disabled={submitting} className="btn btn-primary sm:col-span-2 disabled:opacity-60">
                {submitting ? "Sending..." : "Send Message"}
              </button>
              {status.message && (
                <p
                  className={`rounded-xl p-4 text-sm sm:col-span-2 ${
                    status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {status.message}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
