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

// Multipart upload (no JSON content-type — the browser sets the boundary)
async function uploadRequest(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
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

  // ---- Auth (admins via Google) ----
  // Google login starts by redirecting the browser:
  googleLoginUrl: `${BASE}/auth/google`,
  me: () => request("/auth/me"),

  // ---- Student auth (sign-up / login with OTP) ----
  student: {
    signup: (payload) => request("/students/signup", { method: "POST", body: JSON.stringify(payload) }),
    verifySignup: (payload) => request("/students/verify-otp", { method: "POST", body: JSON.stringify(payload) }),
    login: (payload) => request("/students/login", { method: "POST", body: JSON.stringify(payload) }),
    verifyLogin: (payload) => request("/students/login-verify", { method: "POST", body: JSON.stringify(payload) })
  },

  // ---- Calendar booking (public) ----
  getSlots: () => request("/calendar/slots"),
  bookSlot: (payload) => request("/calendar/book", { method: "POST", body: JSON.stringify(payload) }),

  // ---- Admin (requires Google login as a whitelisted admin) ----
  admin: {
    // File upload from the local device (image or video)
    uploadFile: (file) => {
      const fd = new FormData();
      fd.append("file", file);
      return uploadRequest("/admin/upload", fd);
    },
    // Admin management
    getAdmins: () => request("/admin/admins"),
    addAdmin: (email) => request("/admin/admins", { method: "POST", body: JSON.stringify({ email }) }),
    removeAdmin: (email) => request(`/admin/admins/${encodeURIComponent(email)}`, { method: "DELETE" }),

    updateTrainer: (payload) => request("/admin/trainer", { method: "PUT", body: JSON.stringify(payload) }),
    addCourse: (payload) => request("/admin/courses", { method: "POST", body: JSON.stringify(payload) }),
    updateCourse: (id, payload) => request(`/admin/courses/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteCourse: (id) => request(`/admin/courses/${id}`, { method: "DELETE" }),
    addReview: (payload) => request("/admin/reviews", { method: "POST", body: JSON.stringify(payload) }),
    deleteReview: (id) => request(`/admin/reviews/${id}`, { method: "DELETE" }),
    addTestimonial: (payload) => request("/admin/testimonials", { method: "POST", body: JSON.stringify(payload) }),
    updateTestimonial: (id, payload) => request(`/admin/testimonials/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteTestimonial: (id) => request(`/admin/testimonials/${id}`, { method: "DELETE" }),
    addVideo: (payload) => request("/admin/videos", { method: "POST", body: JSON.stringify(payload) }),
    updateVideo: (id, payload) => request(`/admin/videos/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteVideo: (id) => request(`/admin/videos/${id}`, { method: "DELETE" }),
    addImage: (payload) => request("/admin/gallery", { method: "POST", body: JSON.stringify(payload) }),
    updateImage: (id, payload) => request(`/admin/gallery/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteImage: (id) => request(`/admin/gallery/${id}`, { method: "DELETE" }),
    updateTrainerPhoto: (photo) => request("/admin/trainer/photo", { method: "PUT", body: JSON.stringify({ photo }) }),
    getMessages: () => request("/admin/messages"),
    getBookings: () => request("/admin/bookings")
  }
};

export default api;
