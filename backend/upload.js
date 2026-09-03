// ============================================================
// File upload support (multer) — lets admins upload images and
// videos from their local device. Files are stored on disk in
// backend/uploads/ and served statically at /uploads/<filename>.
// ============================================================

import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, "uploads");

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max (videos)
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype) || VIDEO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image (jpg, png, gif, webp, svg) and video (mp4, webm, ogg, mov) files are allowed."));
    }
  }
});

export function isVideoFile(mimetype) {
  return VIDEO_TYPES.includes(mimetype);
}

// ------------------------------------------------------------
// Oral assessment answers — recorded in the browser by STUDENTS
// (not admins), so this gets its own narrower uploader:
//   - audio only
//   - 15 MB cap (a 2-minute Opus answer is well under 1 MB)
//
// MediaRecorder output varies by browser: Chrome/Firefox/Edge give
// audio/webm;codecs=opus, Safari/iOS gives audio/mp4. Chrome also
// sometimes tags an audio-only recording as video/webm, so that is
// accepted too.
// ------------------------------------------------------------
const AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
  "video/webm"
];

export function isAllowedAudio(mimetype) {
  // Ignore codec parameters, e.g. "audio/webm;codecs=opus".
  const base = String(mimetype || "").split(";")[0].trim().toLowerCase();
  return AUDIO_TYPES.includes(base);
}

export const audioUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedAudio(file.mimetype)) cb(null, true);
    else cb(new Error("Only audio recordings (webm, mp4, ogg, wav, m4a) are allowed."));
  }
});
