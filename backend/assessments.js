// ============================================================
// Assessment platform.
//
// Two formats:
//   written — mcq / multi / text questions, auto-scored instantly
//   oral    — the student records answers with their mic; audio is
//             stored and Meenu scores it from the Admin Panel
//             (Spoken German uses this)
//
// SECURITY NOTES
//   1. Correct answers NEVER reach the browser. `sanitizeQuestion()`
//      strips `correctOptions` / `acceptedAnswers` from every
//      student-facing payload; scoring happens here.
//   2. The unlock gate (enrolled + all modules complete) is
//      re-checked server-side when an attempt starts, so the UI
//      cannot be used to skip ahead.
//   3. Students can only read and submit their own attempts.
// ============================================================

import { supabase } from "./db.js";
import { findCourse, isEnrolled, getCourseProgress } from "./learning.js";

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function requireDb() {
  if (!supabase) {
    httpError(
      "Assessments need the database. Add SUPABASE_* to backend/.env and run backend/db/schema.sql.",
      503
    );
  }
}

const QUESTION_TYPES = ["mcq", "multi", "text", "oral"];
const FORMATS = ["written", "oral"];

/** Types the server can score without a human. */
const AUTO_SCORED = ["mcq", "multi", "text"];

// ---------- row <-> object mapping ----------

function rowToAssessment(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description || "",
    format: row.format || "written",
    passPercent: Number(row.pass_percent ?? 80),
    timeLimitMinutes: row.time_limit_minutes == null ? null : Number(row.time_limit_minutes),
    maxAttempts: row.max_attempts == null ? null : Number(row.max_attempts),
    active: row.active !== false
  };
}

function rowToQuestion(row) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    position: row.position ?? 0,
    type: row.type || "mcq",
    prompt: row.prompt,
    helperText: row.helper_text || "",
    options: Array.isArray(row.options) ? row.options : [],
    correctOptions: Array.isArray(row.correct_options) ? row.correct_options : [],
    acceptedAnswers: Array.isArray(row.accepted_answers) ? row.accepted_answers : [],
    points: Number(row.points ?? 1),
    prepSeconds: Number(row.prep_seconds ?? 15),
    maxSeconds: Number(row.max_seconds ?? 90)
  };
}

function rowToAttempt(row) {
  const autoPoints = Number(row.auto_points || 0);
  const trainerPoints = row.trainer_points == null ? null : Number(row.trainer_points);
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    courseId: row.course_id,
    email: row.email,
    name: row.name || "",
    status: row.status || "in_progress",
    autoPoints,
    trainerPoints,
    totalPoints: autoPoints + (trainerPoints || 0),
    maxPoints: Number(row.max_points || 0),
    percent: row.percent == null ? null : Number(row.percent),
    passed: row.passed,
    trainerFeedback: row.trainer_feedback || "",
    gradedBy: row.graded_by || null,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at
  };
}

function rowToAnswer(row) {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    questionId: row.question_id,
    response: row.response ?? null,
    audioUrl: row.audio_url || null,
    autoCorrect: row.auto_correct,
    awardedPoints: Number(row.awarded_points || 0),
    trainerPoints: row.trainer_points == null ? null : Number(row.trainer_points),
    trainerNote: row.trainer_note || ""
  };
}

/** Removes everything a student must not see. */
function sanitizeQuestion(question) {
  const { correctOptions: _c, acceptedAnswers: _a, ...safe } = question;
  return safe;
}

// ---------- scoring ----------

/**
 * Normalizes a typed German answer so spelling variants match:
 * case, surrounding punctuation/whitespace, and umlaut transliteration
 * (ü/ue, ö/oe, ä/ae, ß/ss) all fold to one form.
 */
export function normalizeTextAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:"'´`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function sameIndexSet(a, b) {
  const setA = new Set((a || []).map(Number));
  const setB = new Set((b || []).map(Number));
  if (setA.size !== setB.size) return false;
  for (const value of setA) if (!setB.has(value)) return false;
  return true;
}

/**
 * Scores one answer.
 * @returns {{autoCorrect: boolean|null, awardedPoints: number}}
 *          `autoCorrect: null` means a human has to look at it.
 */
export function scoreAnswer(question, response) {
  const points = Number(question.points ?? 1);

  switch (question.type) {
    case "mcq":
    case "multi": {
      // Both are all-or-nothing: a partially-correct multi-select scores 0,
      // which keeps "choose all that apply" meaningful.
      const selected = Array.isArray(response) ? response : response == null ? [] : [response];
      const correct = sameIndexSet(selected, question.correctOptions);
      return { autoCorrect: correct, awardedPoints: correct ? points : 0 };
    }
    case "text": {
      const given = normalizeTextAnswer(response);
      if (!given) return { autoCorrect: false, awardedPoints: 0 };
      const accepted = (question.acceptedAnswers || []).map(normalizeTextAnswer).filter(Boolean);
      const correct = accepted.includes(given);
      return { autoCorrect: correct, awardedPoints: correct ? points : 0 };
    }
    case "oral":
    default:
      return { autoCorrect: null, awardedPoints: 0 };
  }
}

// ---------- assessment CRUD (admin) ----------

function validateAssessmentInput(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) httpError("An assessment title is required.", 400);
    out.title = title;
  }
  if (body.description !== undefined) out.description = String(body.description || "");

  if (!partial || body.format !== undefined) {
    const format = String(body.format || "written").toLowerCase();
    if (!FORMATS.includes(format)) httpError(`format must be one of: ${FORMATS.join(", ")}.`, 400);
    out.format = format;
  }
  if (body.passPercent !== undefined) {
    const pass = Number(body.passPercent);
    if (!Number.isFinite(pass) || pass < 0 || pass > 100) {
      httpError("passPercent must be between 0 and 100.", 400);
    }
    out.passPercent = pass;
  }
  if (body.timeLimitMinutes !== undefined) {
    out.timeLimitMinutes =
      body.timeLimitMinutes === null || body.timeLimitMinutes === ""
        ? null
        : Math.max(1, Number(body.timeLimitMinutes) || 1);
  }
  if (body.maxAttempts !== undefined) {
    out.maxAttempts =
      body.maxAttempts === null || body.maxAttempts === ""
        ? null
        : Math.max(1, Number(body.maxAttempts) || 1);
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  return out;
}

const ASSESSMENT_FIELDS = {
  title: "title",
  description: "description",
  format: "format",
  passPercent: "pass_percent",
  timeLimitMinutes: "time_limit_minutes",
  maxAttempts: "max_attempts",
  active: "active"
};

function assessmentToRow(patch) {
  const row = {};
  for (const [jsKey, column] of Object.entries(ASSESSMENT_FIELDS)) {
    if (patch[jsKey] !== undefined) row[column] = patch[jsKey];
  }
  return row;
}

export async function getAssessmentByCourse(courseId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("course_id", Number(courseId))
    .maybeSingle();

  if (error) {
    console.error("⚠️ getAssessmentByCourse failed:", error.message);
    return null;
  }
  return data ? rowToAssessment(data) : null;
}

export async function listQuestions(assessmentId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("assessment_questions")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("⚠️ listQuestions failed:", error.message);
    return [];
  }
  return (data || []).map(rowToQuestion);
}

/** Admin view — includes the correct answers. */
export async function getAssessmentForAdmin(courseId) {
  requireDb();
  const assessment = await getAssessmentByCourse(courseId);
  if (!assessment) return null;
  return { ...assessment, questions: await listQuestions(assessment.id) };
}

export async function upsertAssessment(courseId, body) {
  requireDb();
  if (!findCourse(courseId)) httpError("That course does not exist.", 404);

  const existing = await getAssessmentByCourse(courseId);
  const input = validateAssessmentInput(body, { partial: Boolean(existing) });

  if (existing) {
    const { data, error } = await supabase
      .from("assessments")
      .update({ ...assessmentToRow(input), updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) httpError(`Assessment was not saved: ${error.message}`, 502);
    return rowToAssessment(data);
  }

  const { data, error } = await supabase
    .from("assessments")
    .insert({ ...assessmentToRow(input), course_id: Number(courseId) })
    .select()
    .single();
  if (error) httpError(`Assessment was not saved: ${error.message}`, 502);
  return rowToAssessment(data);
}

export async function deleteAssessment(courseId) {
  requireDb();
  const existing = await getAssessmentByCourse(courseId);
  if (!existing) httpError("No assessment for that course.", 404);

  // Questions, attempts and answers cascade (see db/schema.sql).
  const { error } = await supabase.from("assessments").delete().eq("id", existing.id);
  if (error) httpError(`Assessment was not deleted: ${error.message}`, 502);
  return existing;
}

// ---------- question CRUD (admin) ----------

function validateQuestionInput(body = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || body.type !== undefined) {
    const type = String(body.type || "mcq").toLowerCase();
    if (!QUESTION_TYPES.includes(type)) {
      httpError(`Question type must be one of: ${QUESTION_TYPES.join(", ")}.`, 400);
    }
    out.type = type;
  }
  if (!partial || body.prompt !== undefined) {
    const prompt = String(body.prompt || "").trim();
    if (!prompt) httpError("A question prompt is required.", 400);
    out.prompt = prompt;
  }
  if (body.helperText !== undefined) out.helperText = String(body.helperText || "");

  if (body.options !== undefined) {
    out.options = (Array.isArray(body.options) ? body.options : [])
      .map((o) => String(o).trim())
      .filter(Boolean);
  }
  if (body.correctOptions !== undefined) {
    out.correctOptions = (Array.isArray(body.correctOptions) ? body.correctOptions : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0);
  }
  if (body.acceptedAnswers !== undefined) {
    out.acceptedAnswers = (Array.isArray(body.acceptedAnswers)
      ? body.acceptedAnswers
      : String(body.acceptedAnswers || "").split(",")
    )
      .map((a) => String(a).trim())
      .filter(Boolean);
  }
  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isFinite(points) || points <= 0) httpError("points must be a positive number.", 400);
    out.points = points;
  }
  if (body.position !== undefined) out.position = Number(body.position) || 0;
  if (body.prepSeconds !== undefined) out.prepSeconds = Math.max(0, Number(body.prepSeconds) || 0);
  if (body.maxSeconds !== undefined) out.maxSeconds = Math.max(5, Number(body.maxSeconds) || 90);

  return out;
}

/**
 * Cross-field checks that depend on the question's final shape, so they run
 * against the merged result rather than the patch alone. Without this an admin
 * could save an MCQ whose correct index doesn't exist, which would make the
 * question impossible to answer correctly.
 */
function validateQuestionShape(question) {
  const { type, options = [], correctOptions = [], acceptedAnswers = [] } = question;

  if (type === "mcq" || type === "multi") {
    if (options.length < 2) httpError("Give at least two options.", 400);
    if (!correctOptions.length) httpError("Mark at least one option as correct.", 400);
    if (type === "mcq" && correctOptions.length !== 1) {
      httpError("A single-answer question needs exactly one correct option.", 400);
    }
    const outOfRange = correctOptions.filter((i) => i >= options.length);
    if (outOfRange.length) httpError("A correct-answer index points past the end of the options.", 400);
  }

  if (type === "text" && !acceptedAnswers.length) {
    httpError("Give at least one accepted answer for a fill-in-the-blank question.", 400);
  }
}

const QUESTION_FIELDS = {
  position: "position",
  type: "type",
  prompt: "prompt",
  helperText: "helper_text",
  options: "options",
  correctOptions: "correct_options",
  acceptedAnswers: "accepted_answers",
  points: "points",
  prepSeconds: "prep_seconds",
  maxSeconds: "max_seconds"
};

function questionToRow(patch) {
  const row = {};
  for (const [jsKey, column] of Object.entries(QUESTION_FIELDS)) {
    if (patch[jsKey] !== undefined) row[column] = patch[jsKey];
  }
  return row;
}

export async function createQuestion(courseId, body) {
  requireDb();
  const assessment = await getAssessmentByCourse(courseId);
  if (!assessment) httpError("Create the assessment before adding questions.", 404);

  const input = validateQuestionInput(body);
  validateQuestionShape({
    type: input.type,
    options: input.options || [],
    correctOptions: input.correctOptions || [],
    acceptedAnswers: input.acceptedAnswers || []
  });

  if (input.position === undefined) {
    const existing = await listQuestions(assessment.id);
    input.position = existing.length;
  }

  const { data, error } = await supabase
    .from("assessment_questions")
    .insert({ ...questionToRow(input), assessment_id: assessment.id })
    .select()
    .single();

  if (error) httpError(`Question was not saved: ${error.message}`, 502);
  return rowToQuestion(data);
}

export async function updateQuestion(questionId, body) {
  requireDb();

  const { data: current, error: loadError } = await supabase
    .from("assessment_questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();
  if (loadError) httpError(`Could not load that question: ${loadError.message}`, 502);
  if (!current) httpError("Question not found.", 404);

  const input = validateQuestionInput(body, { partial: true });
  // Validate the merged shape, not just the incoming fields.
  validateQuestionShape({ ...rowToQuestion(current), ...input });

  const { data, error } = await supabase
    .from("assessment_questions")
    .update({ ...questionToRow(input), updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .select()
    .single();

  if (error) httpError(`Question was not updated: ${error.message}`, 502);
  return rowToQuestion(data);
}

export async function deleteQuestion(questionId) {
  requireDb();
  const { data, error } = await supabase
    .from("assessment_questions")
    .delete()
    .eq("id", questionId)
    .select()
    .maybeSingle();

  if (error) httpError(`Question was not deleted: ${error.message}`, 502);
  if (!data) httpError("Question not found.", 404);
  return rowToQuestion(data);
}

/**
 * First-run seeding for one course's assessment. Skips silently if the course
 * already has one, so it's safe on every boot.
 *
 * Passed to learning.js → seedLearningContent() as a callback, which avoids a
 * circular import between the two modules.
 *
 * @returns {Promise<boolean>} true if an assessment was created
 */
export async function seedAssessmentForCourse(courseId, seed) {
  if (!supabase || !seed) return false;
  if (await getAssessmentByCourse(courseId)) return false;

  const { data: created, error } = await supabase
    .from("assessments")
    .insert({
      course_id: Number(courseId),
      title: seed.title || "Course Assessment",
      description: seed.description || "",
      format: seed.format || "written",
      pass_percent: seed.passPercent ?? 80,
      time_limit_minutes: seed.timeLimitMinutes ?? null,
      max_attempts: seed.maxAttempts ?? null,
      active: true
    })
    .select()
    .single();

  if (error) {
    console.error(`⚠️ Assessment seed insert failed for course ${courseId}:`, error.message);
    return false;
  }

  const rows = (seed.questions || []).map((q, index) => ({
    assessment_id: created.id,
    position: index,
    type: q.type || "mcq",
    prompt: q.prompt,
    helper_text: q.helperText || "",
    options: q.options || [],
    correct_options: q.correctOptions || [],
    accepted_answers: q.acceptedAnswers || [],
    points: q.points ?? 1,
    prep_seconds: q.prepSeconds ?? 15,
    max_seconds: q.maxSeconds ?? 90
  }));

  if (rows.length) {
    const { error: questionError } = await supabase.from("assessment_questions").insert(rows);
    if (questionError) {
      console.error(`⚠️ Question seed failed for course ${courseId}:`, questionError.message);
    }
  }

  return true;
}

// ---------- student flow ----------

export async function listAttempts(email, courseId) {
  if (!supabase || !email) return [];
  const query = supabase
    .from("assessment_attempts")
    .select("*")
    .eq("email", String(email).toLowerCase())
    .order("started_at", { ascending: false });

  if (courseId != null) query.eq("course_id", Number(courseId));

  const { data, error } = await query;
  if (error) {
    console.error("⚠️ listAttempts failed:", error.message);
    return [];
  }
  return (data || []).map(rowToAttempt);
}

/**
 * Everything the student needs to decide whether they can take the assessment,
 * without leaking any answers.
 */
export async function getAssessmentStatus(email, courseId) {
  const assessment = await getAssessmentByCourse(courseId);
  if (!assessment || !assessment.active) {
    return { exists: false, reason: "No assessment has been published for this course yet." };
  }

  const progress = await getCourseProgress(email, courseId);
  const questions = await listQuestions(assessment.id);
  const attempts = email ? await listAttempts(email, courseId) : [];

  const inProgress = attempts.find((a) => a.status === "in_progress") || null;
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const best = finished.reduce(
    (top, a) => (a.percent != null && (top == null || a.percent > top.percent) ? a : top),
    null
  );

  const attemptsUsed = finished.length;
  const attemptsLeft =
    assessment.maxAttempts == null ? null : Math.max(0, assessment.maxAttempts - attemptsUsed);

  let lockedReason = "";
  if (!questions.length) lockedReason = "This assessment has no questions yet.";
  else if (!progress.enrolled) lockedReason = "Enroll in this course to take the assessment.";
  else if (!progress.allModulesComplete) {
    lockedReason = `Finish all ${progress.total} modules first — you're at ${progress.completed}/${progress.total}.`;
  } else if (attemptsLeft === 0) lockedReason = "You've used all your attempts.";

  return {
    exists: true,
    assessment: { ...assessment, questionCount: questions.length, totalPoints: sumPoints(questions) },
    progress: {
      enrolled: progress.enrolled,
      completed: progress.completed,
      total: progress.total,
      percent: progress.percent,
      allModulesComplete: progress.allModulesComplete
    },
    unlocked: !lockedReason,
    lockedReason,
    attemptsUsed,
    attemptsLeft,
    inProgressAttemptId: inProgress?.id || null,
    best,
    attempts: finished
  };
}

function sumPoints(questions) {
  return questions.reduce((total, q) => total + Number(q.points ?? 1), 0);
}

/**
 * Starts (or resumes) an attempt. Re-checks the unlock gate server-side.
 * @returns {{attempt, questions}} questions are sanitized — no answers.
 */
export async function startAttempt({ email, name, courseId }) {
  requireDb();
  const clean = String(email || "").toLowerCase();
  if (!clean) httpError("Sign in to take the assessment.", 401);

  const status = await getAssessmentStatus(clean, courseId);
  if (!status.exists) httpError(status.reason, 404);

  const assessment = status.assessment;
  const questions = await listQuestions(assessment.id);

  // Resume rather than creating a second open attempt.
  if (status.inProgressAttemptId) {
    const attempt = await getAttempt(status.inProgressAttemptId);
    return { attempt, questions: questions.map(sanitizeQuestion), resumed: true };
  }

  if (!status.unlocked) httpError(status.lockedReason, 403);

  const { data, error } = await supabase
    .from("assessment_attempts")
    .insert({
      assessment_id: assessment.id,
      course_id: Number(courseId),
      email: clean,
      name: name || "",
      status: "in_progress",
      max_points: sumPoints(questions)
    })
    .select()
    .single();

  if (error) httpError(`Could not start the assessment: ${error.message}`, 502);
  return { attempt: rowToAttempt(data), questions: questions.map(sanitizeQuestion), resumed: false };
}

export async function getAttempt(attemptId) {
  requireDb();
  const { data, error } = await supabase
    .from("assessment_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();

  if (error) httpError(`Could not load that attempt: ${error.message}`, 502);
  if (!data) httpError("Attempt not found.", 404);
  return rowToAttempt(data);
}

export async function listAnswers(attemptId) {
  requireDb();
  const { data, error } = await supabase
    .from("assessment_answers")
    .select("*")
    .eq("attempt_id", attemptId);

  if (error) httpError(`Could not load answers: ${error.message}`, 502);
  return (data || []).map(rowToAnswer);
}

/** Students may only touch their own attempts. */
function assertOwner(attempt, email) {
  if (String(attempt.email).toLowerCase() !== String(email || "").toLowerCase()) {
    httpError("That attempt belongs to another student.", 403);
  }
}

/**
 * Stores one oral answer's audio. Called per question as the student records,
 * before the final submit.
 */
export async function saveOralAnswer({ attemptId, questionId, email, audioUrl }) {
  requireDb();
  const attempt = await getAttempt(attemptId);
  assertOwner(attempt, email);
  if (attempt.status !== "in_progress") httpError("This attempt has already been submitted.", 409);

  const questions = await listQuestions(attempt.assessmentId);
  const question = questions.find((q) => String(q.id) === String(questionId));
  if (!question) httpError("Question not found in this assessment.", 404);
  if (question.type !== "oral") httpError("That question does not take a recording.", 400);

  const { data, error } = await supabase
    .from("assessment_answers")
    .upsert(
      {
        attempt_id: attemptId,
        question_id: questionId,
        audio_url: audioUrl,
        auto_correct: null, // awaiting trainer review
        awarded_points: 0,
        updated_at: new Date().toISOString()
      },
      { onConflict: "attempt_id,question_id" }
    )
    .select()
    .single();

  if (error) httpError(`Recording was not saved: ${error.message}`, 502);
  return rowToAnswer(data);
}

/**
 * Submits an attempt. Auto-scorable answers are graded immediately; if any
 * question needs a human (oral), the attempt is left `submitted` for review.
 */
export async function submitAttempt({ attemptId, email, answers = [] }) {
  requireDb();
  const attempt = await getAttempt(attemptId);
  assertOwner(attempt, email);
  if (attempt.status !== "in_progress") httpError("This attempt has already been submitted.", 409);

  const questions = await listQuestions(attempt.assessmentId);
  const byId = new Map(questions.map((q) => [String(q.id), q]));
  const submitted = new Map(
    (Array.isArray(answers) ? answers : []).map((a) => [String(a.questionId), a.response])
  );

  // Oral audio was uploaded separately, so keep those rows.
  const existing = await listAnswers(attemptId);
  const existingByQuestion = new Map(existing.map((a) => [String(a.questionId), a]));

  const rows = [];
  let autoPoints = 0;

  for (const question of questions) {
    const key = String(question.id);
    const prior = existingByQuestion.get(key);

    if (question.type === "oral") {
      // Nothing to score here; a missing recording simply scores 0 on review.
      rows.push({
        attempt_id: attemptId,
        question_id: question.id,
        response: null,
        audio_url: prior?.audioUrl || null,
        auto_correct: null,
        awarded_points: 0,
        updated_at: new Date().toISOString()
      });
      continue;
    }

    const response = submitted.has(key) ? submitted.get(key) : prior?.response ?? null;
    const { autoCorrect, awardedPoints } = scoreAnswer(question, response);
    autoPoints += awardedPoints;

    rows.push({
      attempt_id: attemptId,
      question_id: question.id,
      response: response ?? null,
      audio_url: null,
      auto_correct: autoCorrect,
      awarded_points: awardedPoints,
      updated_at: new Date().toISOString()
    });
  }

  const { error: answersError } = await supabase
    .from("assessment_answers")
    .upsert(rows, { onConflict: "attempt_id,question_id" });
  if (answersError) httpError(`Answers were not saved: ${answersError.message}`, 502);

  const needsReview = questions.some((q) => !AUTO_SCORED.includes(q.type));
  const maxPoints = sumPoints(questions);
  const now = new Date().toISOString();

  const patch = {
    auto_points: autoPoints,
    max_points: maxPoints,
    submitted_at: now,
    status: needsReview ? "submitted" : "graded"
  };

  if (!needsReview) {
    const percent = maxPoints ? Math.round((autoPoints / maxPoints) * 1000) / 10 : 0;
    const assessment = await getAssessmentByCourse(attempt.courseId);
    patch.percent = percent;
    patch.passed = percent >= Number(assessment?.passPercent ?? 80);
    patch.graded_at = now;
  }

  const { data, error } = await supabase
    .from("assessment_attempts")
    .update(patch)
    .eq("id", attemptId)
    .select()
    .single();
  if (error) httpError(`Could not submit the assessment: ${error.message}`, 502);

  return {
    attempt: rowToAttempt(data),
    needsReview,
    // Per-question feedback is only meaningful once fully graded.
    review: needsReview ? [] : await buildReview(attemptId, questions)
  };
}

/** Question-by-question result, shown after grading. */
async function buildReview(attemptId, questions) {
  const answers = await listAnswers(attemptId);
  const byQuestion = new Map(answers.map((a) => [String(a.questionId), a]));

  return questions.map((q) => {
    const answer = byQuestion.get(String(q.id));
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      points: q.points,
      response: answer?.response ?? null,
      audioUrl: answer?.audioUrl || null,
      autoCorrect: answer?.autoCorrect ?? null,
      awardedPoints: answer?.trainerPoints ?? answer?.awardedPoints ?? 0,
      trainerNote: answer?.trainerNote || "",
      // Safe to reveal now the attempt is graded.
      correctOptions: q.correctOptions,
      acceptedAnswers: q.acceptedAnswers,
      options: q.options
    };
  });
}

/** A student's own finished attempt, with full feedback. */
export async function getAttemptResult({ attemptId, email, isAdmin = false }) {
  requireDb();
  const attempt = await getAttempt(attemptId);
  if (!isAdmin) assertOwner(attempt, email);

  const questions = await listQuestions(attempt.assessmentId);

  // Hide per-question detail while a trainer review is still pending, so a
  // student can't infer answers from a partially-graded attempt.
  if (attempt.status === "submitted" && !isAdmin) {
    return { attempt, review: [], pendingReview: true };
  }
  return { attempt, review: await buildReview(attemptId, questions), pendingReview: false };
}

// ---------- trainer grading (admin) ----------

/** Attempts waiting for a human, newest first. */
export async function listGradingQueue() {
  requireDb();
  const { data, error } = await supabase
    .from("assessment_attempts")
    .select("*")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (error) httpError(`Could not load the grading queue: ${error.message}`, 502);

  const attempts = (data || []).map(rowToAttempt);

  // Attach the course title so the queue is readable at a glance.
  return attempts.map((a) => ({
    ...a,
    courseTitle: findCourse(a.courseId)?.title || `Course ${a.courseId}`
  }));
}

/** Everything a trainer needs to grade one attempt, answers included. */
export async function getAttemptForGrading(attemptId) {
  requireDb();
  const attempt = await getAttempt(attemptId);
  const questions = await listQuestions(attempt.assessmentId);
  const answers = await listAnswers(attemptId);
  const byQuestion = new Map(answers.map((a) => [String(a.questionId), a]));

  return {
    attempt: { ...attempt, courseTitle: findCourse(attempt.courseId)?.title || `Course ${attempt.courseId}` },
    items: questions.map((q) => {
      const answer = byQuestion.get(String(q.id));
      return {
        answerId: answer?.id || null,
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        helperText: q.helperText,
        points: q.points,
        needsReview: !AUTO_SCORED.includes(q.type),
        response: answer?.response ?? null,
        audioUrl: answer?.audioUrl || null,
        autoCorrect: answer?.autoCorrect ?? null,
        awardedPoints: Number(answer?.awardedPoints || 0),
        trainerPoints: answer?.trainerPoints ?? null,
        trainerNote: answer?.trainerNote || "",
        options: q.options,
        correctOptions: q.correctOptions,
        acceptedAnswers: q.acceptedAnswers
      };
    })
  };
}

/**
 * Records a trainer's scores for the review-needed answers and finalizes
 * the attempt.
 *
 * @param {object[]} scores  [{ questionId, points, note }]
 */
export async function gradeAttempt({ attemptId, scores = [], feedback = "", gradedBy }) {
  requireDb();
  const attempt = await getAttempt(attemptId);
  if (attempt.status === "in_progress") {
    httpError("This attempt hasn't been submitted yet.", 409);
  }

  const questions = await listQuestions(attempt.assessmentId);
  const byId = new Map(questions.map((q) => [String(q.id), q]));

  let trainerPoints = 0;
  const rows = [];

  for (const entry of Array.isArray(scores) ? scores : []) {
    const question = byId.get(String(entry.questionId));
    if (!question) httpError("A score refers to a question not in this assessment.", 400);

    const max = Number(question.points ?? 1);
    const given = Number(entry.points);
    if (!Number.isFinite(given) || given < 0 || given > max) {
      httpError(`Score for "${question.prompt.slice(0, 40)}…" must be between 0 and ${max}.`, 400);
    }

    trainerPoints += given;
    rows.push({
      attempt_id: attemptId,
      question_id: question.id,
      trainer_points: given,
      trainer_note: String(entry.note || ""),
      updated_at: new Date().toISOString()
    });
  }

  if (rows.length) {
    // The answer rows already exist (created at submit), so this merges scores in.
    const { error } = await supabase
      .from("assessment_answers")
      .upsert(rows, { onConflict: "attempt_id,question_id" });
    if (error) httpError(`Scores were not saved: ${error.message}`, 502);
  }

  const assessment = await getAssessmentByCourse(attempt.courseId);
  const maxPoints = attempt.maxPoints || sumPoints(questions);
  const total = Number(attempt.autoPoints || 0) + trainerPoints;
  const percent = maxPoints ? Math.round((total / maxPoints) * 1000) / 10 : 0;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("assessment_attempts")
    .update({
      trainer_points: trainerPoints,
      percent,
      passed: percent >= Number(assessment?.passPercent ?? 80),
      trainer_feedback: String(feedback || ""),
      graded_by: gradedBy || null,
      graded_at: now,
      status: "graded"
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (error) httpError(`Grade was not saved: ${error.message}`, 502);
  return rowToAttempt(data);
}
