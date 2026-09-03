// ============================================================
// Learning & assessment routes (mounted from server.js):
//   Public   — course syllabus
//   Student  — progress ticks, assessment attempts, oral recordings
//   Admin    — module editor, assessment builder, grading queue,
//              manual enrollment
//
// Authorisation layering:
//   requireStudent proves WHO you are;
//   learning.js / assessments.js decide WHAT you may open.
// ============================================================

import express from "express";
import {
  listModules,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  getCourseProgress,
  setModuleProgress,
  listEnrollments,
  listAllEnrollments,
  getStudentsOverview,
  grantEnrollmentManually,
  revokeEnrollment,
  findCourse
} from "./learning.js";
import {
  getAssessmentStatus,
  getAssessmentForAdmin,
  upsertAssessment,
  deleteAssessment,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  startAttempt,
  submitAttempt,
  saveOralAnswer,
  getAttemptResult,
  listGradingQueue,
  getAttemptForGrading,
  gradeAttempt,
  getAssessmentByCourse
} from "./assessments.js";
import { audioUpload } from "./upload.js";
import { getCertificateEligibility, streamCertificatePdf, CERT_MIN_PERCENT } from "./certificate.js";

// Keeps every handler's error shape consistent (`.status` or 500).
const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    if (!err.status) console.error(`${req.method} ${req.originalUrl} failed:`, err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

export function registerLearningRoutes(app, { requireAdmin, requireStudent, adminEmails, sendNotificationEmail }) {
  const router = express.Router();

  // ============================================================
  // PUBLIC — syllabus (no progress, no answers)
  // ============================================================
  router.get(
    "/learning/courses/:courseId/modules",
    wrap(async (req, res) => {
      const course = findCourse(req.params.courseId);
      if (!course) return res.status(404).json({ error: "Course not found." });

      const modules = await listModules(req.params.courseId);
      const assessment = await getAssessmentByCourse(req.params.courseId);

      res.json({
        courseId: course.id,
        courseTitle: course.title,
        modules,
        // Advertised on the course card so buyers know an assessment exists.
        assessment: assessment?.active
          ? { title: assessment.title, format: assessment.format, passPercent: assessment.passPercent }
          : null
      });
    })
  );

  // ============================================================
  // STUDENT — progress
  // ============================================================
  router.get(
    "/learning/courses/:courseId",
    requireStudent,
    wrap(async (req, res) => {
      if (!findCourse(req.params.courseId)) return res.status(404).json({ error: "Course not found." });
      res.json(await getCourseProgress(req.user.email, req.params.courseId));
    })
  );

  router.post(
    "/learning/progress",
    requireStudent,
    wrap(async (req, res) => {
      const { courseId, moduleId, completed } = req.body || {};
      if (courseId == null || !moduleId) {
        return res.status(400).json({ error: "courseId and moduleId are required." });
      }
      const progress = await setModuleProgress({
        email: req.user.email,
        courseId,
        moduleId,
        completed: Boolean(completed)
      });
      res.json({ success: true, progress });
    })
  );

  /**
   * Lightweight enrollment check for the signed-in student.
   * The Courses section uses this to swap "Enroll & Pay" for an
   * "Enrolled ✓ / Go to course" state on cards they already own.
   */
  router.get(
    "/learning/my-enrollments",
    requireStudent,
    wrap(async (req, res) => {
      const enrollments = await listEnrollments(req.user.email);
      res.json({
        email: req.user.email,
        courseIds: enrollments.map((e) => e.courseId),
        enrollments: enrollments.map((e) => ({
          courseId: e.courseId,
          courseTitle: e.courseTitle,
          status: e.status,
          enrolledAt: e.enrolledAt
        }))
      });
    })
  );

  /** The student's "My Learning" hub: every course they own, with progress. */
  router.get(
    "/learning/me",
    requireStudent,
    wrap(async (req, res) => {
      const enrollments = await listEnrollments(req.user.email);

      const courses = await Promise.all(
        enrollments.map(async (enrollment) => {
          const progress = await getCourseProgress(req.user.email, enrollment.courseId);
          const course = findCourse(enrollment.courseId);
          const assessment = await getAssessmentByCourse(enrollment.courseId);
          return {
            courseId: enrollment.courseId,
            title: course?.title || enrollment.courseTitle,
            level: course?.level || "",
            enrolledAt: enrollment.enrolledAt,
            completed: progress.completed,
            total: progress.total,
            percent: progress.percent,
            allModulesComplete: progress.allModulesComplete,
            hasAssessment: Boolean(assessment?.active),
            assessmentFormat: assessment?.format || null
          };
        })
      );

      res.json({ email: req.user.email, courses });
    })
  );

  // ============================================================
  // STUDENT — assessments
  // ============================================================
  router.get(
    "/assessments/:courseId/status",
    requireStudent,
    wrap(async (req, res) => {
      if (!findCourse(req.params.courseId)) return res.status(404).json({ error: "Course not found." });
      res.json(await getAssessmentStatus(req.user.email, req.params.courseId));
    })
  );

  router.post(
    "/assessments/:courseId/start",
    requireStudent,
    wrap(async (req, res) => {
      const result = await startAttempt({
        email: req.user.email,
        name: req.user.name,
        courseId: req.params.courseId
      });
      res.status(result.resumed ? 200 : 201).json(result);
    })
  );

  /**
   * Uploads one oral answer. The student records in the browser and sends the
   * blob here; multer stores it and we attach the URL to the answer row.
   */
  router.post(
    "/assessments/attempts/:attemptId/audio/:questionId",
    requireStudent,
    (req, res) => {
      audioUpload.single("audio")(req, res, async (uploadError) => {
        try {
          if (uploadError) return res.status(400).json({ error: uploadError.message });
          if (!req.file) return res.status(400).json({ error: "No recording was received." });

          const answer = await saveOralAnswer({
            attemptId: req.params.attemptId,
            questionId: req.params.questionId,
            email: req.user.email,
            audioUrl: `/uploads/${req.file.filename}`
          });
          res.status(201).json({ success: true, answer });
        } catch (err) {
          res.status(err.status || 500).json({ error: err.message });
        }
      });
    }
  );

  router.post(
    "/assessments/attempts/:attemptId/submit",
    requireStudent,
    wrap(async (req, res) => {
      const result = await submitAttempt({
        attemptId: req.params.attemptId,
        email: req.user.email,
        answers: req.body?.answers || []
      });

      // Tell Meenu there's something to grade.
      if (result.needsReview) {
        sendNotificationEmail?.({
          to: adminEmails.join(","),
          subject: `🎤 Oral assessment submitted — ${req.user.name || req.user.email}`,
          text:
            `${req.user.name || req.user.email} submitted an oral assessment for review.\n\n` +
            `Course: ${findCourse(result.attempt.courseId)?.title || result.attempt.courseId}\n` +
            `Attempt: ${result.attempt.id}\n\n` +
            "Open the Admin Panel → 🎤 Grading to listen and score."
        }).catch((err) => console.error("⚠️ Grading notification failed:", err.message));
      }

      res.json({ success: true, ...result });
    })
  );

  router.get(
    "/assessments/attempts/:attemptId",
    requireStudent,
    wrap(async (req, res) => {
      res.json(await getAttemptResult({ attemptId: req.params.attemptId, email: req.user.email }));
    })
  );

  /**
   * Student asks the trainer to publish assessment questions for a course
   * they're enrolled in. Sends an email notification to the admins.
   */
  router.post(
    "/assessments/:courseId/request-questions",
    requireStudent,
    wrap(async (req, res) => {
      const course = findCourse(req.params.courseId);
      if (!course) return res.status(404).json({ error: "Course not found." });

      sendNotificationEmail?.({
        to: adminEmails.join(","),
        subject: `📝 Assessment questions requested — ${course.title}`,
        text:
          `${req.user.name || req.user.email} (${req.user.email}) is ready to take the assessment for:\n\n` +
          `Course: ${course.level ? course.level + " · " : ""}${course.title}\n\n` +
          "But no questions have been published yet.\n" +
          "Open the Admin Panel → 📝 Assessments to add questions for this course."
      }).catch((err) => console.error("⚠️ Question-request notification failed:", err.message));

      res.json({
        success: true,
        message: "Request sent! Meenu has been notified and will add the questions soon."
      });
    })
  );

  // ============================================================
  // STUDENT — completion certificate (score >= 80%)
  // ============================================================
  router.get(
    "/learning/courses/:courseId/certificate/status",
    requireStudent,
    wrap(async (req, res) => {
      const result = await getCertificateEligibility(req.user.email, req.params.courseId);
      res.json({ minPercent: CERT_MIN_PERCENT, ...result, course: undefined });
    })
  );

  router.get(
    "/learning/courses/:courseId/certificate",
    requireStudent,
    wrap(async (req, res) => {
      const result = await getCertificateEligibility(req.user.email, req.params.courseId);
      if (!result.eligible) {
        return res.status(403).json({ error: result.reason });
      }
      streamCertificatePdf(res, {
        studentName: result.studentName || req.user.name || "",
        email: req.user.email,
        course: result.course,
        percent: result.percent,
        completedAt: result.completedAt
      });
    })
  );

  // ============================================================
  // ADMIN — modules
  // ============================================================
  router.get(
    "/admin/courses/:courseId/modules",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ modules: await listModules(req.params.courseId) });
    })
  );

  router.post(
    "/admin/courses/:courseId/modules",
    requireAdmin,
    wrap(async (req, res) => {
      res.status(201).json({ success: true, module: await createModule(req.params.courseId, req.body) });
    })
  );

  router.put(
    "/admin/modules/:moduleId",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, module: await updateModule(req.params.moduleId, req.body) });
    })
  );

  router.delete(
    "/admin/modules/:moduleId",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, removed: await deleteModule(req.params.moduleId) });
    })
  );

  router.put(
    "/admin/courses/:courseId/modules/reorder",
    requireAdmin,
    wrap(async (req, res) => {
      const modules = await reorderModules(req.params.courseId, req.body?.orderedIds);
      res.json({ success: true, modules });
    })
  );

  // ============================================================
  // ADMIN — assessment builder
  // ============================================================
  router.get(
    "/admin/courses/:courseId/assessment",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ assessment: await getAssessmentForAdmin(req.params.courseId) });
    })
  );

  router.put(
    "/admin/courses/:courseId/assessment",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, assessment: await upsertAssessment(req.params.courseId, req.body) });
    })
  );

  router.delete(
    "/admin/courses/:courseId/assessment",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, removed: await deleteAssessment(req.params.courseId) });
    })
  );

  router.post(
    "/admin/courses/:courseId/assessment/questions",
    requireAdmin,
    wrap(async (req, res) => {
      res.status(201).json({ success: true, question: await createQuestion(req.params.courseId, req.body) });
    })
  );

  router.put(
    "/admin/assessment-questions/:questionId",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, question: await updateQuestion(req.params.questionId, req.body) });
    })
  );

  router.delete(
    "/admin/assessment-questions/:questionId",
    requireAdmin,
    wrap(async (req, res) => {
      res.json({ success: true, removed: await deleteQuestion(req.params.questionId) });
    })
  );

  // ============================================================
  // ADMIN — grading queue (oral answers)
  // ============================================================
  router.get(
    "/admin/grading/queue",
    requireAdmin,
    wrap(async (_req, res) => {
      res.json({ attempts: await listGradingQueue() });
    })
  );

  router.get(
    "/admin/grading/attempts/:attemptId",
    requireAdmin,
    wrap(async (req, res) => {
      res.json(await getAttemptForGrading(req.params.attemptId));
    })
  );

  router.put(
    "/admin/grading/attempts/:attemptId",
    requireAdmin,
    wrap(async (req, res) => {
      const attempt = await gradeAttempt({
        attemptId: req.params.attemptId,
        scores: req.body?.scores || [],
        feedback: req.body?.feedback || "",
        gradedBy: req.user.email
      });

      // Let the student know their result is ready.
      sendNotificationEmail?.({
        to: attempt.email,
        subject: `${attempt.passed ? "✅ Passed" : "📋 Result ready"} — ${
          findCourse(attempt.courseId)?.title || "your assessment"
        }`,
        text:
          `Hello ${attempt.name || ""},\n\n` +
          `Meenu has reviewed your assessment.\n\n` +
          `Score: ${attempt.totalPoints}/${attempt.maxPoints} (${attempt.percent}%)\n` +
          `Result: ${attempt.passed ? "PASSED 🎉" : "Not passed yet"}\n\n` +
          (attempt.trainerFeedback ? `Feedback from Meenu:\n${attempt.trainerFeedback}\n\n` : "") +
          "Sign in to the website to see your full per-question feedback.\n\n— Meenu, German Trainer"
      }).catch((err) => console.error("⚠️ Result email failed:", err.message));

      res.json({ success: true, attempt });
    })
  );

  // ============================================================
  // ADMIN — enrollments
  // ============================================================
  router.get(
    "/admin/enrollments",
    requireAdmin,
    wrap(async (req, res) => {
      const email = req.query.email;
      // No ?email= → every student's enrollment (full history incl. revoked).
      if (!email) return res.json({ enrollments: await listAllEnrollments() });
      res.json({ enrollments: await listEnrollments(email) });
    })
  );

  /**
   * Every student's status in one call: enrollment, module progress and the
   * latest assessment attempt — powers the "Enrollments" dashboard tab.
   */
  router.get(
    "/admin/students-overview",
    requireAdmin,
    wrap(async (_req, res) => {
      res.json(await getStudentsOverview());
    })
  );

  router.post(
    "/admin/enrollments",
    requireAdmin,
    wrap(async (req, res) => {
      const { email, name, courseId } = req.body || {};
      const enrollment = await grantEnrollmentManually({ email, name, courseId });
      res.status(201).json({ success: true, enrollment });
    })
  );

  // A body on DELETE is awkward for some clients, so revoking is a POST.
  router.post(
    "/admin/enrollments/revoke",
    requireAdmin,
    wrap(async (req, res) => {
      const { email, courseId } = req.body || {};
      if (!email || courseId == null) {
        return res.status(400).json({ error: "email and courseId are required." });
      }
      res.json({ success: true, enrollment: await revokeEnrollment(email, courseId) });
    })
  );

  app.use("/api", router);
}
