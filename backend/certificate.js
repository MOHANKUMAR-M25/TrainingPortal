// ============================================================
// Course completion certificate (PDF).
//
// Eligibility (checked server-side, never trusted from the UI):
//   1. student is enrolled in the course
//   2. all modules are complete
//   3. best finished assessment score is >= CERT_MIN_PERCENT (80%)
//
// The PDF is generated on demand with pdfkit and streamed to the
// browser as a download — nothing is stored on disk.
// ============================================================

import PDFDocument from "pdfkit";
import { findCourse, getCourseProgress } from "./learning.js";
import { getAssessmentStatus } from "./assessments.js";

export const CERT_MIN_PERCENT = 80;

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * Decides whether `email` may download a certificate for `courseId`.
 * Returns everything the PDF (and the UI badge) needs.
 */
export async function getCertificateEligibility(email, courseId) {
  const course = findCourse(courseId);
  if (!course) httpError("Course not found.", 404);

  const progress = await getCourseProgress(email, courseId);
  if (!progress.enrolled) {
    return { eligible: false, reason: "You are not enrolled in this course." };
  }
  if (!progress.allModulesComplete) {
    return {
      eligible: false,
      reason: `Complete all ${progress.total} modules first (${progress.completed}/${progress.total} done).`
    };
  }

  const status = await getAssessmentStatus(email, courseId);
  if (!status.exists) {
    return { eligible: false, reason: "This course has no assessment yet." };
  }

  const best = status.best;
  if (!best || best.percent == null) {
    return { eligible: false, reason: "Take the course assessment to earn your certificate." };
  }
  if (Number(best.percent) < CERT_MIN_PERCENT) {
    return {
      eligible: false,
      reason: `Score ${CERT_MIN_PERCENT}% or above on the assessment to earn the certificate (your best: ${best.percent}%).`,
      bestPercent: Number(best.percent)
    };
  }

  return {
    eligible: true,
    course,
    studentName: best.name || "",
    percent: Number(best.percent),
    completedAt: best.gradedAt || best.submittedAt || new Date().toISOString()
  };
}

/**
 * Streams a landscape A4 certificate PDF into `res`.
 * Call only after getCertificateEligibility() said eligible.
 */
export function streamCertificatePdf(res, { studentName, email, course, percent, completedAt }) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });

  const fileName = `certificate-${String(course.title || "course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  doc.pipe(res);

  const W = doc.page.width;   // 841.89
  const H = doc.page.height;  // 595.28

  // --- Background & border (German flag accents) ---
  doc.rect(0, 0, W, H).fill("#fffdf7");
  doc.rect(0, 0, W, 14).fill("#111111");
  doc.rect(0, 14, W, 6).fill("#DD0000");
  doc.rect(0, 20, W, 6).fill("#FFCC00");
  doc.rect(0, H - 26, W, 6).fill("#FFCC00");
  doc.rect(0, H - 20, W, 6).fill("#DD0000");
  doc.rect(0, H - 14, W, 14).fill("#111111");

  // Inner frame
  doc
    .lineWidth(2)
    .roundedRect(40, 50, W - 80, H - 110, 10)
    .stroke("#d4af37");

  // --- Content ---
  doc
    .fillColor("#b91c1c")
    .font("Helvetica-Bold")
    .fontSize(34)
    .text("CERTIFICATE OF COMPLETION", 0, 95, { align: "center" });

  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(14)
    .text("This certificate is proudly presented to", 0, 160, { align: "center" });

  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text(studentName || email, 0, 195, { align: "center" });

  // Underline beneath the name
  const nameWidth = Math.min(420, doc.widthOfString(studentName || email) + 60);
  doc
    .moveTo((W - nameWidth) / 2, 240)
    .lineTo((W + nameWidth) / 2, 240)
    .lineWidth(1.5)
    .stroke("#d4af37");

  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(14)
    .text("for successfully completing the course", 0, 265, { align: "center" });

  doc
    .fillColor("#b91c1c")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(`${course.level ? course.level + " · " : ""}${course.title}`, 60, 295, {
      align: "center",
      width: W - 120
    });

  doc
    .fillColor("#166534")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(`Final Score: ${percent}%  ·  PASSED`, 0, 350, { align: "center" });

  const dateText = new Date(completedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(12)
    .text(`Awarded on ${dateText}`, 0, 385, { align: "center" });

  // --- Signature block ---
  doc
    .moveTo(W / 2 - 110, 480)
    .lineTo(W / 2 + 110, 480)
    .lineWidth(1)
    .stroke("#94a3b8");
  doc
    .fillColor("#0f172a")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Meenu — German Language Trainer", 0, 488, { align: "center" });
  doc
    .fillColor("#94a3b8")
    .font("Helvetica")
    .fontSize(10)
    .text("germantrainer.in", 0, 506, { align: "center" });

  doc.end();
}
