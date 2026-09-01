import { useEffect, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { getSessionId } from "../session";

export default function Contact({ trainer }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);

  // Request-callback modal
  const [showCallback, setShowCallback] = useState(false);
  const [cb, setCb] = useState({ name: "", phone: "", email: "", message: "" });
  const [cbStatus, setCbStatus] = useState({ type: "", message: "" });
  const [cbBusy, setCbBusy] = useState(false);

  // Pre-fill name & email from the logged-in user's profile
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.name || "",
        email: prev.email || user.email || "",
        phone: prev.phone || user.phone || ""
      }));
    }
  }, [user]);

  // Track "half-filled" contact form (abandoned) on unmount
  useEffect(() => {
    return () => {
      if (!submittedRef.current && startedRef.current) {
        api.track.form({
          sessionId: getSessionId(),
          formName: "contact",
          event: "form_abandon",
          filledFields: { name: form.name, email: form.email, phone: form.phone },
          email: form.email || user?.email || null
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.email, form.phone]);

  const handleChange = (e) => {
    if (!startedRef.current) {
      startedRef.current = true;
      api.track.form({ sessionId: getSessionId(), formName: "contact", event: "form_start" });
    }
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ type: "", message: "" });
    try {
      const res = await api.sendContact(form);
      submittedRef.current = true;
      setStatus({ type: "success", message: res.message });
      setForm({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "", subject: "", message: "" });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const submitCallback = async (e) => {
    e.preventDefault();
    setCbBusy(true);
    setCbStatus({ type: "", message: "" });
    try {
      const res = await api.requestCallback(cb);
      setCbStatus({ type: "success", message: res.message });
      setCb({ name: "", phone: "", email: "", message: "" });
      setTimeout(() => setShowCallback(false), 2500);
    } catch (err) {
      setCbStatus({ type: "error", message: err.message });
    } finally {
      setCbBusy(false);
    }
  };

  return (
    <section id="contact" className="bg-slate-50 py-20">
      <div className="container-site">
        <h2 className="section-title">
          Get in <span>Touch</span>
        </h2>
        <p className="section-subtitle">
          Questions about courses, exams or moving to Germany? Send a message or request a call back — no sign-in
          required.
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

            {/* Request a call back — no login required */}
            <button
              onClick={() => setShowCallback(true)}
              className="btn btn-gold w-full !py-3"
            >
              📞 Request a Call Back
            </button>
            <p className="text-center text-xs text-slate-400">
              Just your name & number — Meenu will call you. No sign-in needed.
            </p>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="card grid gap-4 !p-8 sm:grid-cols-2">
              {user && (
                <p className="rounded-xl bg-green-50 p-3 text-xs text-green-700 sm:col-span-2">
                  ✅ Messaging as <span className="font-bold">{user.name || user.email}</span> — your details are
                  filled in automatically.
                </p>
              )}
              <input className="input-field" name="name" placeholder="Your name *" value={form.name} onChange={handleChange} required />
              <input className="input-field" name="email" type="email" placeholder="Your email *" value={form.email} onChange={handleChange} required />
              <input className="input-field sm:col-span-2" name="phone" placeholder="Phone (optional)" value={form.phone} onChange={handleChange} />
              <input className="input-field sm:col-span-2" name="subject" placeholder="Subject" value={form.subject} onChange={handleChange} />
              <textarea className="input-field sm:col-span-2" name="message" rows="5" placeholder="Your message *" value={form.message} onChange={handleChange} required />
              <button type="submit" disabled={submitting} className="btn btn-primary sm:col-span-2 disabled:opacity-60">
                {submitting ? "Sending..." : "Send Message"}
              </button>
              {status.message && (
                <p className={`rounded-xl p-4 text-sm sm:col-span-2 ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {status.message}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Request Callback modal */}
      {showCallback && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCallback(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold">📞 Request a Call Back</h3>
              <button onClick={() => setShowCallback(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <p className="mt-1 text-sm text-slate-500">Leave your number and Meenu will call you back — no account needed.</p>
            <form onSubmit={submitCallback} className="mt-5 grid gap-3">
              <input className="input-field" placeholder="Your name *" value={cb.name} onChange={(e) => setCb({ ...cb, name: e.target.value })} required />
              <input className="input-field" placeholder="Phone number *" value={cb.phone} onChange={(e) => setCb({ ...cb, phone: e.target.value })} required />
              <input className="input-field" type="email" placeholder="Email (optional)" value={cb.email} onChange={(e) => setCb({ ...cb, email: e.target.value })} />
              <textarea className="input-field" rows="2" placeholder="What is it about? (optional)" value={cb.message} onChange={(e) => setCb({ ...cb, message: e.target.value })} />
              <button type="submit" disabled={cbBusy} className="btn btn-primary disabled:opacity-60">
                {cbBusy ? "Sending..." : "Request Call Back"}
              </button>
              {cbStatus.message && (
                <p className={`rounded-xl p-3 text-sm ${cbStatus.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {cbStatus.message}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
