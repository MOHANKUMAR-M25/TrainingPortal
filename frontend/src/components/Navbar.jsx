import { useState, useEffect } from "react";
import { useAuth } from "../AuthContext";

const links = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#courses", label: "Courses" },
  { href: "#consultation", label: "Consultation" },
  { href: "#reviews", label: "Reviews" },
  { href: "#videos", label: "Videos" },
  { href: "#gallery", label: "Gallery" },
  { href: "#contact", label: "Contact" }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, isAdmin, login, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="flag-stripe" />
      <nav
        className={`transition-all duration-300 ${
          scrolled ? "bg-white/90 shadow-md backdrop-blur" : "bg-white/70 backdrop-blur"
        }`}
      >
        <div className="container-site flex h-16 items-center justify-between">
          <a href="#home" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="text-2xl">🇩🇪</span>
            <span>
              <span className="text-german-red">Meenu</span> · German Trainer
            </span>
          </a>

          {/* Desktop links */}
          <div className="hidden items-center gap-5 lg:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
            {isAdmin && (
              <a href="#admin" className="nav-link font-bold !text-german-red">
                Admin
              </a>
            )}
            <a href="#consultation" className="btn btn-primary !px-5 !py-2 text-sm">
              Book a Slot
            </a>

            {/* Auth button */}
            {user ? (
              <div className="flex items-center gap-2">
                {user.picture && (
                  <img src={user.picture} alt={user.name} className="h-8 w-8 rounded-full ring-2 ring-german-gold" />
                )}
                <button onClick={logout} className="nav-link text-xs" title={`Signed in as ${user.email}`}>
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                className="flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                title="Trainer sign-in (Google)"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.96 10.96 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Sign in
              </button>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="border-t border-slate-100 bg-white px-4 pb-4 lg:hidden">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="block py-2.5 text-sm font-medium text-slate-700 hover:text-german-red"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="#admin"
                className="block py-2.5 text-sm font-bold text-german-red"
                onClick={() => setOpen(false)}
              >
                Admin Panel
              </a>
            )}
            {user ? (
              <button onClick={logout} className="mt-2 block py-2.5 text-sm font-medium text-slate-500">
                Sign out ({user.email})
              </button>
            ) : (
              <button onClick={login} className="mt-2 block py-2.5 text-sm font-medium text-slate-700">
                Sign in with Google
              </button>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
