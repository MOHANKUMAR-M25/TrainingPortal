// ============================================================
// Learning layer — course modules, enrollment and progress.
//
// Unlike coupons (which are cached in memory because pricing runs
// synchronously inside the payment path), everything here is
// per-student and read on demand, so it queries Supabase directly.
//
// Requires the tables in db/schema.sql. Without a database the
// module list falls back to the read-only `modules` arrays in
// data/siteData.js and progress tracking is unavailable — callers
// get `{ available: false }` rather than an error.
// ============================================================

import { supabase, isDbConfigured } from "./db.js";
import { siteData } from "./data/siteData.js";

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function requireDb() {
  if (!supabase) {
    httpError(
      "This feature needs the database. Add SUPABASE_* to backend/.env and run backend/db/schema.sql.",
      503
    );
  }
}

/** Courses live in siteData, so validate ids against it. */
export function findCourse(courseId) {
  return (siteData.courses || []).find((c) => String(c.id) === String(courseId)) || null;
}

// ---------- Modules ----------

function rowToModule(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    position: row.position ?? 0,
    title: row.title,
    summary: row.summary || "",
    content: row.content || "",
    durationLabel: row.duration_label || "",
    resourceUrl: row.resource_url || "",
    videoUrl: row.video_url || ""
  };
}

const MODULE_FIELDS = {
  courseId: "course_id",
  position: "position",
  title: "title",
  summary: "summary",
  content: "content",
  durationLabel: "duration_label",
  resourceUrl: "resource_url",
  videoUrl: "video_url"
};

function moduleToRow(patch) {
  const row = {};
  for (const [jsKey, column] of Object.entries(MODULE_FIELDS)) {
    if (patch[jsKey] !== undefined) row[column] = patch[jsKey];
  }
  return row;
}

function validateModuleInput(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) httpError("A module title is required.", 400);
    if (title.length > 200) httpError("Module titles must be 200 characters or fewer.", 400);
    out.title = title;
  }
  if (body.summary !== undefined) out.summary = String(body.summary || "");
  if (body.content !== undefined) out.content = String(body.content || "");
  if (body.durationLabel !== undefined) out.durationLabel = String(body.durationLabel || "");
  if (body.resourceUrl !== undefined) out.resourceUrl = String(body.resourceUrl || "");
  if (body.videoUrl !== undefined) out.videoUrl = String(body.videoUrl || "");
  if (body.position !== undefined) {
    const position = Number(body.position);
    if (!Number.isFinite(position)) httpError("position must be a number.", 400);
    out.position = position;
  }
  return out;
}

/**
 * Modules for a course, ordered.
 * Falls back to the seed arrays in siteData when there is no database, so the
 * syllabus still renders on a fresh checkout.
 */
export async function listModules(courseId) {
  if (!supabase) {
    return (siteData.moduleSeeds?.[courseId] || []).map((m, i) => ({
      id: `seed-${courseId}-${i}`,
      courseId: Number(courseId),
      position: i,
      title: m.title,
      summary: m.summary || "",
      content: m.content || "",
      durationLabel: m.durationLabel || "",
      resourceUrl: "",
      videoUrl: m.videoUrl || "",
      seedOnly: true // cannot be ticked complete — no DB to record it
    }));
  }

  const { data, error } = await supabase
    .from("course_modules")
    .select("*")
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("⚠️ listModules failed:", error.message);
    return [];
  }
  return (data || []).map(rowToModule);
}

export async function createModule(courseId, body) {
  requireDb();
  if (!findCourse(courseId)) httpError("That course does not exist.", 404);

  const input = validateModuleInput(body);

  // Default to the end of the list so new modules don't jump to the top.
  if (input.position === undefined) {
    const existing = await listModules(courseId);
    input.position = existing.length;
  }

  const { data, error } = await supabase
    .from("course_modules")
    .insert({ ...moduleToRow(input), course_id: Number(courseId) })
    .select()
    .single();

  if (error) httpError(`Module was not saved: ${error.message}`, 502);
  return rowToModule(data);
}

export async function updateModule(moduleId, body) {
  requireDb();
  const input = validateModuleInput(body, { partial: true });

  const { data, error } = await supabase
    .from("course_modules")
    .update({ ...moduleToRow(input), updated_at: new Date().toISOString() })
    .eq("id", moduleId)
    .select()
    .maybeSingle();

  if (error) httpError(`Module was not updated: ${error.message}`, 502);
  if (!data) httpError("Module not found.", 404);
  return rowToModule(data);
}

export async function deleteModule(moduleId) {
  requireDb();
  const { data, error } = await supabase
    .from("course_modules")
    .delete()
    .eq("id", moduleId)
    .select()
    .maybeSingle();

  if (error) httpError(`Module was not deleted: ${error.message}`, 502);
  if (!data) httpError("Module not found.", 404);
  return rowToModule(data);
}

/** Persists a whole ordering in one go (drag-free reorder via up/down buttons). */
export async function reorderModules(courseId, orderedIds) {
  requireDb();
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    httpError("Provide an array of module ids in the desired order.", 400);
  }

  const updates = orderedIds.map((id, index) =>
    supabase
      .from("course_modules")
      .update({ position: index, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("course_id", Number(courseId))
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) httpError(`Reorder failed: ${failed.error.message}`, 502);

  return listModules(courseId);
}

// ---------- Enrollment ----------

function rowToEnrollment(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    courseId: row.course_id,
    courseTitle: row.course_title || "",
    source: row.source || "payment",
    status: row.status || "active",
    enrolledAt: row.enrolled_at
  };
}

/**
 * Grants course access. Idempotent — a student who buys the same course twice
 * keeps one enrollment row (enforced by a unique index on email + course_id).
 *
 * Called from the payment-verification path, where `courseId` comes from the
 * stored payment row rather than the client.
 */
export async function grantEnrollment({ email, name, courseId, razorpayOrderId, source = "payment" }) {
  if (!supabase || !email || courseId == null) return { data: null, skipped: true };

  const course = findCourse(courseId);

  const { data, error } = await supabase
    .from("enrollments")
    .upsert(
      {
        email: String(email).toLowerCase(),
        name: name || "",
        course_id: Number(courseId),
        course_title: course?.title || "",
        razorpay_order_id: razorpayOrderId || null,
        source,
        status: "active"
      },
      { onConflict: "email,course_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("⚠️ grantEnrollment failed:", error.message);
    return { data: null, error };
  }
  console.log(`🎓 Enrolled ${email} in course ${courseId} (${course?.title || "?"})`);
  return { data: rowToEnrollment(data) };
}

export async function listEnrollments(email) {
  if (!supabase || !email) return [];
  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("email", String(email).toLowerCase())
    .eq("status", "active")
    .order("enrolled_at", { ascending: false });

  if (error) {
    console.error("⚠️ listEnrollments failed:", error.message);
    return [];
  }
  return (data || []).map(rowToEnrollment);
}

/**
 * ALL enrollments across every student — for the Admin dashboard.
 * Includes revoked rows so the trainer can see full history; each row
 * carries its `status` ("active" | "revoked").
 */
export async function listAllEnrollments() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .order("enrolled_at", { ascending: false });

  if (error) {
    console.error("⚠️ listAllEnrollments failed:", error.message);
    return [];
  }
  return (data || []).map(rowToEnrollment);
}

export async function isEnrolled(email, courseId) {
  if (!supabase || !email) return false;
  const { data, error } = await supabase
    .from("enrollments")
    .select("id")
    .eq("email", String(email).toLowerCase())
    .eq("course_id", Number(courseId))
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("⚠️ isEnrolled failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/** Admin override — grant access without a payment. */
export async function grantEnrollmentManually({ email, name, courseId }) {
  requireDb();
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) httpError("A valid student email is required.", 400);
  if (!findCourse(courseId)) httpError("That course does not exist.", 404);

  const result = await grantEnrollment({
    email: clean,
    name: name || "",
    courseId,
    source: "manual"
  });
  if (result.error) httpError(`Enrollment was not saved: ${result.error.message}`, 502);
  return result.data;
}

export async function revokeEnrollment(email, courseId) {
  requireDb();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ status: "revoked" })
    .eq("email", String(email || "").toLowerCase())
    .eq("course_id", Number(courseId))
    .select()
    .maybeSingle();

  if (error) httpError(`Could not revoke access: ${error.message}`, 502);
  if (!data) httpError("Enrollment not found.", 404);
  return rowToEnrollment(data);
}

// ---------- Progress ----------

export async function listCompletedModuleIds(email, courseId) {
  if (!supabase || !email) return [];
  const { data, error } = await supabase
    .from("module_progress")
    .select("module_id")
    .eq("email", String(email).toLowerCase())
    .eq("course_id", Number(courseId));

  if (error) {
    console.error("⚠️ listCompletedModuleIds failed:", error.message);
    return [];
  }
  return (data || []).map((r) => r.module_id);
}

/**
 * Ticks or un-ticks a module for a student.
 * Only enrolled students can record progress, so the assessment gate can't be
 * opened by someone who never bought the course.
 */
export async function setModuleProgress({ email, courseId, moduleId, completed }) {
  requireDb();
  const clean = String(email || "").toLowerCase();
  if (!clean) httpError("Sign in to track your progress.", 401);

  if (!(await isEnrolled(clean, courseId))) {
    httpError("Enroll in this course to track your progress.", 403);
  }

  // The module must belong to the course being claimed.
  const { data: moduleRow, error: moduleError } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .maybeSingle();

  if (moduleError) httpError(`Could not load that module: ${moduleError.message}`, 502);
  if (!moduleRow) httpError("Module not found.", 404);
  if (Number(moduleRow.course_id) !== Number(courseId)) {
    httpError("That module belongs to a different course.", 400);
  }

  if (completed) {
    const { error } = await supabase.from("module_progress").upsert(
      {
        email: clean,
        course_id: Number(courseId),
        module_id: moduleId,
        completed_at: new Date().toISOString()
      },
      { onConflict: "email,module_id" }
    );
    if (error) httpError(`Progress was not saved: ${error.message}`, 502);
  } else {
    const { error } = await supabase
      .from("module_progress")
      .delete()
      .eq("email", clean)
      .eq("module_id", moduleId);
    if (error) httpError(`Progress was not saved: ${error.message}`, 502);
  }

  return getCourseProgress(clean, courseId);
}

/**
 * The student's view of one course: modules, which are done, and whether the
 * assessment has unlocked.
 *
 * `unlocked` is the authoritative gate — assessments.js re-checks it before
 * starting an attempt, so the UI state can't be used to skip ahead.
 */
export async function getCourseProgress(email, courseId) {
  const modules = await listModules(courseId);
  const clean = String(email || "").toLowerCase();

  const enrolled = clean ? await isEnrolled(clean, courseId) : false;
  const completedIds = enrolled ? await listCompletedModuleIds(clean, courseId) : [];
  const completedSet = new Set(completedIds.map(String));

  const total = modules.length;
  const completed = modules.filter((m) => completedSet.has(String(m.id))).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return {
    courseId: Number(courseId),
    enrolled,
    available: Boolean(supabase),
    modules: modules.map((m) => ({ ...m, completed: completedSet.has(String(m.id)) })),
    total,
    completed,
    percent,
    // An assessment needs at least one module, all of them ticked.
    allModulesComplete: total > 0 && completed === total,
    trackingEnabled: Boolean(supabase) && enrolled
  };
}

/**
 * Admin overview: every student's enrollment, enriched with their module
 * progress and latest assessment attempt, so the trainer can see exactly
 * where each student stands in each course.
 */
export async function getStudentsOverview() {
  if (!supabase) return { available: false, rows: [] };

  const [enrollRes, progressRes, modulesRes, attemptsRes] = await Promise.all([
    supabase.from("enrollments").select("*").order("enrolled_at", { ascending: false }),
    supabase.from("module_progress").select("email, course_id, module_id"),
    supabase.from("course_modules").select("id, course_id"),
    supabase
      .from("assessment_attempts")
      .select("email, course_id, status, percent, passed, submitted_at")
      .order("started_at", { ascending: false })
  ]);

  if (enrollRes.error) {
    console.error("⚠️ getStudentsOverview failed:", enrollRes.error.message);
    return { available: true, rows: [] };
  }

  // module totals per course
  const totalsByCourse = new Map();
  for (const m of modulesRes.data || []) {
    totalsByCourse.set(m.course_id, (totalsByCourse.get(m.course_id) || 0) + 1);
  }

  // completed count per student+course
  const doneByKey = new Map();
  for (const p of progressRes.data || []) {
    const key = `${p.email}|${p.course_id}`;
    doneByKey.set(key, (doneByKey.get(key) || 0) + 1);
  }

  // latest attempt per student+course (rows are ordered newest first)
  const attemptByKey = new Map();
  for (const a of attemptsRes.data || []) {
    const key = `${a.email}|${a.course_id}`;
    if (!attemptByKey.has(key)) attemptByKey.set(key, a);
  }

  const rows = (enrollRes.data || []).map((row) => {
    const key = `${row.email}|${row.course_id}`;
    const total = totalsByCourse.get(row.course_id) || 0;
    const completed = Math.min(doneByKey.get(key) || 0, total || Infinity) || 0;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const attempt = attemptByKey.get(key) || null;
    const course = findCourse(row.course_id);

    return {
      email: row.email,
      name: row.name || "",
      courseId: row.course_id,
      courseTitle: course?.title || row.course_title || `Course ${row.course_id}`,
      level: course?.level || "",
      source: row.source || "payment",
      status: row.status || "active",
      enrolledAt: row.enrolled_at,
      modulesTotal: total,
      modulesCompleted: completed,
      progressPercent: percent,
      assessmentStatus: attempt?.status || null,
      assessmentPercent: attempt?.percent ?? null,
      assessmentPassed: attempt?.passed ?? null,
      assessmentSubmittedAt: attempt?.submitted_at || null
    };
  });

  return { available: true, rows };
}

export function isLearningConfigured() {
  return isDbConfigured();
}

/**
 * First-run seeding for modules and assessments, mirroring how coupons work:
 * an EMPTY table gets the defaults from data/siteData.js, and after that the
 * database is the source of truth. Existing rows are never touched, so this is
 * safe to run on every boot.
 *
 * Assessment seeding is passed in as a callback to avoid a circular import
 * (assessments.js already imports from this module).
 *
 * @returns {Promise<{source: string, note?: string, modules?: number, assessments?: number}>}
 */
export async function seedLearningContent({ seedAssessment } = {}) {
  if (!supabase) {
    return { source: "memory", note: "Supabase not configured — modules are read-only and progress tracking is off." };
  }

  // A missing table means schema.sql hasn't been run.
  const { error: probeError } = await supabase.from("course_modules").select("id").limit(1);
  if (probeError) {
    return {
      source: "seed",
      note: "Could not read course_modules — run backend/db/schema.sql in Supabase. Modules are read-only until then."
    };
  }

  let modulesWritten = 0;
  let assessmentsWritten = 0;

  for (const [courseIdKey, seeds] of Object.entries(siteData.moduleSeeds || {})) {
    const courseId = Number(courseIdKey);
    if (!findCourse(courseId) || !seeds?.length) continue;

    const { count, error: countError } = await supabase
      .from("course_modules")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if (countError) {
      console.error(`⚠️ Could not count modules for course ${courseId}:`, countError.message);
      continue;
    }
    if (count) continue; // already has modules — leave them alone

    const rows = seeds.map((m, index) => ({
      course_id: courseId,
      position: index,
      title: m.title,
      summary: m.summary || "",
      content: m.content || "",
      duration_label: m.durationLabel || "",
      resource_url: m.resourceUrl || ""
    }));

    const { error } = await supabase.from("course_modules").insert(rows);
    if (error) console.error(`⚠️ Module seed failed for course ${courseId}:`, error.message);
    else modulesWritten += rows.length;
  }

  if (typeof seedAssessment === "function") {
    for (const [courseIdKey, seed] of Object.entries(siteData.assessmentSeeds || {})) {
      const courseId = Number(courseIdKey);
      if (!findCourse(courseId) || !seed) continue;
      try {
        if (await seedAssessment(courseId, seed)) assessmentsWritten += 1;
      } catch (err) {
        console.error(`⚠️ Assessment seed failed for course ${courseId}:`, err.message);
      }
    }
  }

  return { source: "supabase", modules: modulesWritten, assessments: assessmentsWritten };
}
