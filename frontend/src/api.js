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

  // ---- Public config (feature flags + Razorpay public key) ----
  getConfig: () => request("/config"),

  // ---- Flash sale + coupons (public) ----
  getFlashSale: () => request("/flash-sale"),
  getCoupons: () => request("/coupons"),
  // Preview only — the backend re-validates the code when the order is created.
  // Pass either { courseId } or { sessionId } so the discount is scoped correctly.
  validateCoupon: (payload) => request("/coupons/validate", { method: "POST", body: JSON.stringify(payload) }),

  // ---- Anonymous request-a-callback (no login) ----
  requestCallback: (payload) => request("/callback", { method: "POST", body: JSON.stringify(payload) }),

  // ---- Analytics tracking (fire-and-forget; ignore failures) ----
  track: {
    visit: (payload) =>
      fetch("/api/track/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {}),
    form: (payload) =>
      fetch("/api/track/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {})
  },

  // ---- Learning: modules, progress, my courses ----
  learning: {
    // Public syllabus for a course (no progress, no answers)
    modules: (courseId) => request(`/learning/courses/${courseId}/modules`),
    // Signed-in student's progress through a course
    progress: (courseId) => request(`/learning/courses/${courseId}`),
    setModuleDone: (courseId, moduleId, completed) =>
      request("/learning/progress", {
        method: "POST",
        body: JSON.stringify({ courseId, moduleId, completed })
      }),
    myCourses: () => request("/learning/me"),
    // Which courses does the signed-in student already own?
    myEnrollments: () => request("/learning/my-enrollments"),
    // Certificate: eligibility check + authenticated PDF download
    certificateStatus: (courseId) => request(`/learning/courses/${courseId}/certificate/status`),
    downloadCertificate: async (courseId, courseTitle = "course") => {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${BASE}/learning/courses/${courseId}/certificate`, { headers });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Certificate download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${String(courseTitle).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  },

  // ---- Assessments (student) ----
  assessment: {
    status: (courseId) => request(`/assessments/${courseId}/status`),
    start: (courseId) => request(`/assessments/${courseId}/start`, { method: "POST" }),
    submit: (attemptId, answers) =>
      request(`/assessments/attempts/${attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers })
      }),
    result: (attemptId) => request(`/assessments/attempts/${attemptId}`),
    // Student asks the trainer to publish questions for this course
    requestQuestions: (courseId) =>
      request(`/assessments/${courseId}/request-questions`, { method: "POST" }),
    // Oral answers: one recording per question, uploaded as it's made.
    uploadAudio: (attemptId, questionId, blob, filename = "answer.webm") => {
      const fd = new FormData();
      fd.append("audio", blob, filename);
      return uploadRequest(`/assessments/attempts/${attemptId}/audio/${questionId}`, fd);
    }
  },

  // ---- Booking lifecycle + Razorpay payments ----
  bookingAttempt: (payload) => request("/booking/attempt", { method: "POST", body: JSON.stringify(payload) }),
  bookingAbandon: (payload) => request("/booking/abandon", { method: "POST", body: JSON.stringify(payload) }),
  createOrder: (payload) => request("/create-order", { method: "POST", body: JSON.stringify(payload) }),
  verifyPayment: (payload) => request("/verify-payment", { method: "POST", body: JSON.stringify(payload) }),
  paymentFailed: (payload) => request("/payment-failed", { method: "POST", body: JSON.stringify(payload) }),


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

    // Coupons + flash sale banner
    getCoupons: () => request("/admin/coupons"),
    addCoupon: (payload) => request("/admin/coupons", { method: "POST", body: JSON.stringify(payload) }),
    updateCoupon: (code, payload) =>
      request(`/admin/coupons/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteCoupon: (code) => request(`/admin/coupons/${encodeURIComponent(code)}`, { method: "DELETE" }),
    getFlashSale: () => request("/admin/flash-sale"),
    updateFlashSale: (payload) => request("/admin/flash-sale", { method: "PUT", body: JSON.stringify(payload) }),

    // Course modules
    getModules: (courseId) => request(`/admin/courses/${courseId}/modules`),
    addModule: (courseId, payload) =>
      request(`/admin/courses/${courseId}/modules`, { method: "POST", body: JSON.stringify(payload) }),
    updateModule: (moduleId, payload) =>
      request(`/admin/modules/${moduleId}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteModule: (moduleId) => request(`/admin/modules/${moduleId}`, { method: "DELETE" }),
    reorderModules: (courseId, orderedIds) =>
      request(`/admin/courses/${courseId}/modules/reorder`, {
        method: "PUT",
        body: JSON.stringify({ orderedIds })
      }),

    // Assessment builder
    getAssessment: (courseId) => request(`/admin/courses/${courseId}/assessment`),
    saveAssessment: (courseId, payload) =>
      request(`/admin/courses/${courseId}/assessment`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteAssessment: (courseId) => request(`/admin/courses/${courseId}/assessment`, { method: "DELETE" }),
    addQuestion: (courseId, payload) =>
      request(`/admin/courses/${courseId}/assessment/questions`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    updateQuestion: (questionId, payload) =>
      request(`/admin/assessment-questions/${questionId}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteQuestion: (questionId) => request(`/admin/assessment-questions/${questionId}`, { method: "DELETE" }),

    // Grading queue (oral answers)
    gradingQueue: () => request("/admin/grading/queue"),
    getAttemptForGrading: (attemptId) => request(`/admin/grading/attempts/${attemptId}`),
    gradeAttempt: (attemptId, payload) =>
      request(`/admin/grading/attempts/${attemptId}`, { method: "PUT", body: JSON.stringify(payload) }),

    // Enrollments
    getEnrollments: (email) =>
      request(email ? `/admin/enrollments?email=${encodeURIComponent(email)}` : "/admin/enrollments"),
    // Every student's enrollment + progress + assessment status
    getStudentsOverview: () => request("/admin/students-overview"),
    addEnrollment: (payload) => request("/admin/enrollments", { method: "POST", body: JSON.stringify(payload) }),
    revokeEnrollment: (email, courseId) =>
      request("/admin/enrollments/revoke", { method: "POST", body: JSON.stringify({ email, courseId }) }),

    getMessages: () => request("/admin/messages"),
    getBookings: () => request("/admin/bookings"),
    getDashboard: () => request("/admin/dashboard")
  }
};

export default api;
