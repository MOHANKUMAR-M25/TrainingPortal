// ============================================================
// API helper — all communication with the backend goes here.
// The Vite dev server proxies "/api" to http://localhost:5000
// Includes JWT auth headers for admin (trainer) actions.
// ============================================================

const BASE = "/api";
const TOKEN_KEY = "gt_session_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // ---- Public content ----
  getSite: () => request("/site"),
  getTrainer: () => request("/trainer"),
  getCourses: () => request("/courses"),
  getConsultation: () => request("/consultation"),
  getReviews: () => request("/reviews"),
  getTestimonials: () => request("/testimonials"),
  getVideos: () => request("/videos"),
  getGallery: () => request("/gallery"),
  sendContact: (payload) => request("/contact", { method: "POST", body: JSON.stringify(payload) }),

  // ---- Auth ----
  // Google login starts by redirecting the browser:
  googleLoginUrl: `${BASE}/auth/google`,
  me: () => request("/auth/me"),

  // ---- Calendar booking (public) ----
  getSlots: () => request("/calendar/slots"),
  bookSlot: (payload) => request("/calendar/book", { method: "POST", body: JSON.stringify(payload) }),

  // ---- Admin (trainer only — requires Google login as meenupkc@gmail.com) ----
  admin: {
    updateTrainer: (payload) => request("/admin/trainer", { method: "PUT", body: JSON.stringify(payload) }),
    addReview: (payload) => request("/admin/reviews", { method: "POST", body: JSON.stringify(payload) }),
    deleteReview: (id) => request(`/admin/reviews/${id}`, { method: "DELETE" }),
    addTestimonial: (payload) => request("/admin/testimonials", { method: "POST", body: JSON.stringify(payload) }),
    deleteTestimonial: (id) => request(`/admin/testimonials/${id}`, { method: "DELETE" }),
    addVideo: (payload) => request("/admin/videos", { method: "POST", body: JSON.stringify(payload) }),
    deleteVideo: (id) => request(`/admin/videos/${id}`, { method: "DELETE" }),
    addImage: (payload) => request("/admin/gallery", { method: "POST", body: JSON.stringify(payload) }),
    deleteImage: (id) => request(`/admin/gallery/${id}`, { method: "DELETE" }),
    getMessages: () => request("/admin/messages"),
    getBookings: () => request("/admin/bookings")
  }
};

export default api;
