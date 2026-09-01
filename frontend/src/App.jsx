import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { AuthProvider, useAuth } from "./AuthContext";
import LoginPage from "./components/LoginPage";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import About from "./components/About";
import Courses from "./components/Courses";
import Consultation from "./components/Consultation";
import Reviews from "./components/Reviews";
import Testimonials from "./components/Testimonials";
import Videos from "./components/Videos";
import Gallery from "./components/Gallery";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import AdminPanel from "./components/AdminPanel";
import Dashboard from "./components/Dashboard";
import { getSessionId } from "./session";

const ENTERED_KEY = "gt_entered_site";

function Site() {
  const { user, checking } = useAuth();
  const [entered, setEntered] = useState(() => sessionStorage.getItem(ENTERED_KEY) === "1");
  const [site, setSite] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSite = useCallback(() => {
    api
      .getSite()
      .then(setSite)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadSite, [loadSite]);

  // Track the visit once per mount ("who just visited?")
  useEffect(() => {
    api.track.visit({
      sessionId: getSessionId(),
      page: window.location.pathname,
      referrer: document.referrer || "",
      email: user?.email || null
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterAsStudent = () => {
    sessionStorage.setItem(ENTERED_KEY, "1");
    setEntered(true);
  };

  // On sign-out, return to the login page
  useEffect(() => {
    if (!user && !checking) {
      // If the user just logged out (no session), clear the "entered" flag
      // only when it was set by an authenticated session; guests keep browsing.
      const wasAuthed = sessionStorage.getItem("gt_was_authed") === "1";
      if (wasAuthed) {
        sessionStorage.removeItem(ENTERED_KEY);
        sessionStorage.removeItem("gt_was_authed");
        setEntered(false);
      }
    }
    if (user) {
      sessionStorage.setItem("gt_was_authed", "1");
    }
  }, [user, checking]);

  if (checking || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-german-gold border-t-german-red" />
          <p className="mt-4 font-medium text-slate-500">Loading the site...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 font-display text-xl font-bold">Backend not reachable</h1>
          <p className="mt-2 text-sm text-slate-500">
            {error} — Make sure the backend server is running:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">cd backend && npm start</code>
          </p>
          <button className="btn btn-primary mt-6 !py-2.5 text-sm" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show the login page until the visitor picks Student or signs in (Admin)
  if (!entered && !user) {
    return <LoginPage onContinueAsStudent={enterAsStudent} />;
  }

  return (
    <>
      <Navbar />
      <main>
        <Hero trainer={site.trainer} onContentChanged={loadSite} />
        {/* Admin panel + dashboard render only for whitelisted admin accounts */}
        <AdminPanel
          gallery={site.gallery}
          trainer={site.trainer}
          testimonials={site.testimonials}
          courses={site.courses}
          onContentChanged={loadSite}
        />
        <Dashboard />
        <About trainer={site.trainer} />
        <Courses courses={site.courses} onContentChanged={loadSite} />
        <Consultation consultation={site.consultation} />
        <Reviews reviews={site.reviews} />
        <Testimonials testimonials={site.testimonials} onContentChanged={loadSite} />
        <Videos videos={site.videos} onContentChanged={loadSite} />
        <Gallery gallery={site.gallery} onContentChanged={loadSite} />
        <Contact trainer={site.trainer} />
      </main>
      <Footer trainer={site.trainer} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Site />
    </AuthProvider>
  );
}
