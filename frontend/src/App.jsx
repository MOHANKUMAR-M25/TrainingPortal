import { useCallback, useEffect, useState } from "react";
import api from "./api";
import { AuthProvider } from "./AuthContext";
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

function Site() {
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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-german-gold border-t-german-red" />
          <p className="mt-4 font-medium text-slate-500">Lade... Loading the site...</p>
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

  return (
    <>
      <Navbar />
      <main>
        <Hero trainer={site.trainer} />
        {/* Admin panel renders only when signed in as meenupkc@gmail.com */}
        <AdminPanel onContentChanged={loadSite} />
        <About trainer={site.trainer} />
        <Courses courses={site.courses} />
        <Consultation consultation={site.consultation} />
        <Reviews reviews={site.reviews} />
        <Testimonials testimonials={site.testimonials} />
        <Videos videos={site.videos} />
        <Gallery gallery={site.gallery} />
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
