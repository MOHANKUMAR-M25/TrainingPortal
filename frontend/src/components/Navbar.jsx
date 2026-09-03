import { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext";

const baseLinks = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#courses", label: "Courses" },
  { href: "#spoken-german", label: "Spoken German", requires: "spokenGerman" },
  { href: "#consultation", label: "Consultation" },
  { href: "#reviews", label: "Reviews" },
  { href: "#videos", label: "Videos" },
  { href: "#gallery", label: "Gallery" },
  { href: "#contact", label: "Contact" }
];

export default function Navbar({ hasSpokenGerman = false }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, isAdmin, isGuest, logout } = useAuth();
  const profileRef = useRef(null);

  // Hide the Spoken German link if that section is switched off in siteData.
  const links = baseLinks.filter((l) => l.requires !== "spokenGerman" || hasSpokenGerman);

  // "My Learning" only exists for signed-in students (admins use the panel).
  const showMyLearning = Boolean(user?.email) && !isGuest && !isAdmin;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock background scrolling while the mobile drawer is open — without this,
  // iOS Safari scrolls the page behind the menu.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Close the drawer if the viewport grows to desktop while it is open.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e) => e.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Close the profile popup when clicking outside of it
  useEffect(() => {
    const onClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="flag-stripe" />
      <nav
        className={`transition-all duration-300 ${
          scrolled ? "bg-white/90 shadow-md backdrop-blur" : "bg-white/70 backdrop-blur"
        }`}
      >
        <div className="container-site flex h-16 items-center gap-4">
          {/* Brand — left. The suffix is dropped on narrow phones so the
              hamburger never gets pushed off-screen. */}
          <a href="#home" className="flex min-w-0 shrink items-center gap-2 font-display text-base font-bold sm:text-lg">
            <span className="text-xl sm:text-2xl">🇩🇪</span>
            <span className="truncate whitespace-nowrap">
              <span className="text-german-red">Meenu</span>
              <span className="hidden xs:inline"> · German Trainer</span>
            </span>
          </a>

          {/* Nav links — center */}
          <div className="hidden flex-1 items-center justify-center gap-5 lg:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="nav-link whitespace-nowrap">
                {l.label}
              </a>
            ))}
            {showMyLearning && (
              <a href="#my-learning" className="nav-link whitespace-nowrap font-bold !text-german-red">
                🎓 My Learning
              </a>
            )}
            {isAdmin && (
              <a href="#admin" className="nav-link whitespace-nowrap font-bold !text-german-red">
                Admin
              </a>
            )}
            {isAdmin && (
              <a href="#dashboard" className="nav-link whitespace-nowrap font-bold !text-german-red">
                📊 Dashboard
              </a>
            )}
          </div>

          {/* Actions — right */}
          <div className="hidden shrink-0 items-center gap-3 lg:flex">
            <a href="#consultation" className="btn btn-primary whitespace-nowrap !px-4 !py-2 text-sm">
              Book a Slot
            </a>

            {/* Profile avatar — click to open popup with details & sign out */}
            {user && (
              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  title={user.name || user.email}
                  aria-label="Open profile menu"
                  className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-2 transition-all duration-200 hover:scale-105 hover:shadow-md ${
                    profileOpen ? "ring-german-red" : "ring-german-gold"
                  }`}
                >
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-german-gold/20 text-base">
                      {isGuest ? "👤" : "🎓"}
                    </span>
                  )}
                </button>

                {/* Profile popup */}
                {profileOpen && (
                  <div className="absolute right-0 top-12 w-64 animate-fade-in-up rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-100">
                    <div className="flex items-center gap-3">
                      {user.picture ? (
                        <img
                          src={user.picture}
                          alt={user.name}
                          className="h-11 w-11 shrink-0 rounded-full ring-2 ring-german-gold"
                        />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-german-gold/20 text-xl ring-2 ring-german-gold">
                          {isGuest ? "👤" : "🎓"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {user.name || (isGuest ? "Guest" : "Student")}
                        </p>
                        <p className="truncate text-xs text-slate-500" title={user.email}>
                          {user.email || (isGuest ? "Browsing as a guest" : "")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isAdmin
                            ? "bg-german-gold/20 text-yellow-700"
                            : isGuest
                            ? "bg-slate-100 text-slate-600"
                            : "bg-red-50 text-german-red"
                        }`}
                      >
                        {isAdmin ? "🔐 Admin" : isGuest ? "👤 Guest" : "🎓 Student"}
                      </span>
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          logout();
                        }}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-german-red hover:bg-german-red hover:text-white hover:shadow-md"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile toggle — right on small screens. 44px square meets the
              iOS/Android minimum tap target. */}
          <button
            className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
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

        {/* Mobile menu — scrolls independently and respects the iOS home
            indicator, so long link lists stay reachable on short screens. */}
        {open && (
          <div
            id="mobile-menu"
            className="max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain border-t border-slate-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="flex min-h-[44px] items-center border-b border-slate-50 text-[15px] font-medium text-slate-700 hover:text-german-red"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {showMyLearning && (
              <a
                href="#my-learning"
                className="flex min-h-[44px] items-center border-b border-slate-50 text-[15px] font-bold text-german-red"
                onClick={() => setOpen(false)}
              >
                🎓 My Learning
              </a>
            )}
            {isAdmin && (
              <>
                <a
                  href="#admin"
                  className="flex min-h-[44px] items-center border-b border-slate-50 text-[15px] font-bold text-german-red"
                  onClick={() => setOpen(false)}
                >
                  Admin Panel
                </a>
                <a
                  href="#dashboard"
                  className="flex min-h-[44px] items-center border-b border-slate-50 text-[15px] font-bold text-german-red"
                  onClick={() => setOpen(false)}
                >
                  📊 Dashboard
                </a>
              </>
            )}

            {/* Primary CTA — previously desktop-only, so phone visitors had no
                direct route to the booking form from the menu. */}
            <a
              href="#consultation"
              className="btn btn-primary mt-4 w-full !py-3 text-sm"
              onClick={() => setOpen(false)}
            >
              Book a Slot
            </a>

            {user && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex min-w-0 items-center gap-2">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="h-9 w-9 shrink-0 rounded-full ring-2 ring-german-gold"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-german-gold/20 text-sm ring-2 ring-german-gold">
                      {isGuest ? "👤" : "🎓"}
                    </span>
                  )}
                  <p className="truncate text-sm font-semibold text-slate-700">
                    {user.name || user.email || (isGuest ? "Guest" : "")}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="min-h-[40px] shrink-0 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-german-red hover:bg-german-red hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
