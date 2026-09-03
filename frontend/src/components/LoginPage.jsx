// ============================================================
// Polished Login Page — choose Admin or Student.
// - Admin   → Google sign-in; only whitelisted admin emails
//             get edit access to images, courses, links etc.
// - Student → Sign up (new users) with OTP verification via
//             email + phone, or Log in (existing users) with
//             an email OTP. Guests can also browse without
//             an account.
// ============================================================

import { useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

export default function LoginPage({ onContinueAsStudent }) {
  const { login, loginStudent, loginGuest } = useAuth();

  const continueAsGuest = () => {
    loginGuest();
    onContinueAsStudent?.();
  };
  const [role, setRole] = useState(null); // "admin" | "student"

  // Student flow state
  const [studentMode, setStudentMode] = useState("signup"); // "signup" | "login"
  const [step, setStep] = useState("form"); // "form" | "otp"
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [smsFailed, setSmsFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const resetStudentFlow = () => {
    setStep("form");
    setEmailOtp("");
    setPhoneOtp("");
    setLoginOtp("");
    setError("");
    setInfo("");
    setSmsFailed(false);
  };

  // ---- Sign-up: step 1 (send OTPs) ----
  const handleSignup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.student.signup(form);
      setSmsFailed(Boolean(res.smsFailed));
      setInfo(res.message);
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Sign-up: step 2 (verify OTPs) ----
  const handleVerifySignup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.student.verifySignup({
        email: form.email,
        emailOtp,
        phoneOtp
      });
      loginStudent(res.token, res.student);
      onContinueAsStudent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Login: step 1 (send OTP) ----
  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.student.login({ email: form.email });
      setInfo(res.message);
      setStep("otp");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Login: step 2 (verify OTP) ----
  const handleVerifyLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.student.verifyLogin({ email: form.email, otp: loginOtp });
      loginStudent(res.token, res.student);
      onContinueAsStudent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-german-red/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-german-gold/20 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-2 w-full -translate-x-1/2">
          <div className="flag-stripe" />
        </div>
      </div>

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Card */}
        <div className="rounded-3xl bg-white/95 p-8 shadow-2xl ring-1 ring-white/20 backdrop-blur sm:p-10">
          {/* Header */}
          <div className="text-center">
            <span className="text-5xl">🇩🇪</span>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
              Welcome!
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Learn German with <span className="font-semibold text-german-red">Meenu</span>
            </p>
          </div>

          {/* Role selector */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setRole("student");
                resetStudentFlow();
              }}
              className={`group rounded-2xl border-2 p-4 text-center transition-all duration-300 ${
                role === "student"
                  ? "border-german-red bg-red-50 shadow-lg"
                  : "border-slate-200 hover:border-german-red/50 hover:bg-slate-50"
              }`}
            >
              <span className="text-3xl">🎓</span>
              <p className="mt-2 font-display text-sm font-bold text-slate-900">Student</p>
              <p className="mt-1 text-xs text-slate-500">Sign up / Log in & book slots</p>
            </button>

            <button
              onClick={() => setRole("admin")}
              className={`group rounded-2xl border-2 p-4 text-center transition-all duration-300 ${
                role === "admin"
                  ? "border-german-gold bg-yellow-50 shadow-lg"
                  : "border-slate-200 hover:border-german-gold/60 hover:bg-slate-50"
              }`}
            >
              <span className="text-3xl">🔐</span>
              <p className="mt-2 font-display text-sm font-bold text-slate-900">Admin</p>
              <p className="mt-1 text-xs text-slate-500">Edit courses, images & links</p>
            </button>
          </div>

          {/* Action area */}
          <div className="mt-8">
            {/* ================= STUDENT ================= */}
            {role === "student" && (
              <div className="animate-fade-in-up">
                {/* Sign up / Log in switch */}
                <div className="flex gap-1 rounded-full bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentMode("signup");
                      resetStudentFlow();
                    }}
                    className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
                      studentMode === "signup" ? "bg-german-red text-white shadow" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    ✨ New user? Sign Up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentMode("login");
                      resetStudentFlow();
                    }}
                    className={`flex-1 rounded-full py-2 text-xs font-bold transition ${
                      studentMode === "login" ? "bg-german-red text-white shadow" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    👋 Existing user? Log In
                  </button>
                </div>

                {/* ---- SIGN UP ---- */}
                {studentMode === "signup" && step === "form" && (
                  <form onSubmit={handleSignup} className="mt-4 space-y-3">
                    <input
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-german-red"
                      placeholder="Full name *"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                    <input
                      type="email"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-german-red"
                      placeholder="Email address *"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                    <input
                      type="tel"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-german-red"
                      placeholder="Phone number with country code * (e.g. +919876543210)"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      required
                    />
                    {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
                    <button className="btn btn-primary w-full disabled:opacity-60" disabled={busy}>
                      {busy ? "Sending codes…" : "Send Verification Codes"}
                    </button>
                    <p className="text-center text-xs text-slate-400">
                      We'll send one-time codes to your email and phone to verify your account.
                    </p>
                  </form>
                )}

                {studentMode === "signup" && step === "otp" && (
                  <form onSubmit={handleVerifySignup} className="mt-4 space-y-3">
                    {info && <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700">📬 {info}</p>}
                    <input
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] outline-none transition focus:border-german-red"
                      placeholder="Email code"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                      required
                      autoFocus
                    />
                    <p className="text-center text-xs text-slate-400">6-digit code sent to {form.email}</p>
                    {!smsFailed && (
                      <>
                        <input
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] outline-none transition focus:border-german-red"
                          placeholder="Phone code"
                          maxLength={6}
                          value={phoneOtp}
                          onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ""))}
                          required
                        />
                        <p className="text-center text-xs text-slate-400">6-digit code sent to {form.phone}</p>
                      </>
                    )}
                    {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
                    <button className="btn btn-primary w-full disabled:opacity-60" disabled={busy}>
                      {busy ? "Verifying…" : "Verify & Create Account"}
                    </button>
                    <button
                      type="button"
                      onClick={resetStudentFlow}
                      className="w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
                    >
                      ← Back / resend codes
                    </button>
                  </form>
                )}

                {/* ---- LOG IN ---- */}
                {studentMode === "login" && step === "form" && (
                  <form onSubmit={handleLogin} className="mt-4 space-y-3">
                    <input
                      type="email"
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-german-red"
                      placeholder="Registered email address *"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                    {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
                    <button className="btn btn-primary w-full disabled:opacity-60" disabled={busy}>
                      {busy ? "Sending code…" : "Send Login Code"}
                    </button>
                    <p className="text-center text-xs text-slate-400">
                      We'll email you a one-time code — no password needed.
                    </p>
                  </form>
                )}

                {studentMode === "login" && step === "otp" && (
                  <form onSubmit={handleVerifyLogin} className="mt-4 space-y-3">
                    {info && <p className="rounded-lg bg-green-50 p-2 text-xs text-green-700">📬 {info}</p>}
                    <input
                      className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-center text-lg font-bold tracking-[0.4em] outline-none transition focus:border-german-red"
                      placeholder="Login code"
                      maxLength={6}
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ""))}
                      required
                      autoFocus
                    />
                    {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>}
                    <button className="btn btn-primary w-full disabled:opacity-60" disabled={busy}>
                      {busy ? "Verifying…" : "Verify & Log In"}
                    </button>
                    <button
                      type="button"
                      onClick={resetStudentFlow}
                      className="w-full text-center text-xs text-slate-500 underline hover:text-slate-700"
                    >
                      ← Back / resend code
                    </button>
                  </form>
                )}

                {/* Google sign-in for students */}
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-center text-xs text-slate-400">or</p>
                  <button
                    onClick={login}
                    className="flex w-full items-center justify-center gap-3 rounded-full border-2 border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    Continue with Google
                  </button>

                  {/* Guest access */}
                  <button
                    onClick={continueAsGuest}
                    className="mt-3 w-full text-center text-xs font-medium text-slate-500 underline hover:text-german-red"
                  >
                    Or continue as a guest (browse without an account) →
                  </button>
                </div>
              </div>
            )}

            {/* ================= ADMIN ================= */}
            {role === "admin" && (
              <div className="animate-fade-in-up">
                <button
                  onClick={login}
                  className="flex w-full items-center justify-center gap-3 rounded-full border-2 border-slate-200 bg-white px-6 py-3 font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Sign in with Google
                </button>
                <div className="mt-4 rounded-xl bg-yellow-50 p-3 text-center">
                  <p className="text-xs text-yellow-800">
                    🔒 Only authorized admin accounts get edit access. New admins can be added by existing admins from
                    the Admin Panel.
                  </p>
                </div>
              </div>
            )}

            {!role && (
              <p className="text-center text-xs text-slate-400">
                Select how you'd like to continue ↑
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          🇩🇪 Speak German with Confidence
        </p>
      </div>
    </div>
  );
}
