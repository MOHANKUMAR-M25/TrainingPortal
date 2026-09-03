// ============================================================
// Microphone recorder for oral assessment answers.
//
// Flow per question:  prep countdown → record (capped) → play back
//                     → re-record or upload
//
// Browser notes:
//  - getUserMedia needs a secure context: https, or localhost during
//    development. On plain http over a LAN the mic is blocked by the
//    browser, so we detect that and explain it rather than failing.
//  - MediaRecorder's mimetype varies (webm/opus on Chrome & Firefox,
//    mp4/aac on Safari & iOS), so we pick the first supported type
//    and send the real one to the server.
//  - The stream's tracks are always stopped, otherwise the browser
//    keeps showing the "recording" indicator.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

// Preference order — Opus is small and widely supported; mp4 covers Safari.
const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac"
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function extensionFor(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Mic support can't be assumed — iOS in-app browsers often lack it. */
function detectSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "" };
  const secure = window.isSecureContext || window.location.hostname === "localhost";
  if (!secure) {
    return {
      ok: false,
      reason:
        "Your browser blocks microphone access on insecure connections. Open this page over https (or on localhost) to record."
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "This browser doesn't support microphone recording. Try Chrome, Edge, Firefox or Safari." };
  }
  if (typeof MediaRecorder === "undefined") {
    return { ok: false, reason: "This browser can't record audio (MediaRecorder is unavailable)." };
  }
  return { ok: true, reason: "" };
}

/**
 * @param {object}   props
 * @param {number}   props.prepSeconds  thinking time before recording starts
 * @param {number}   props.maxSeconds   hard cap on the recording
 * @param {boolean}  props.uploaded     whether this answer is already saved
 * @param {boolean}  props.busy         disables controls during upload
 * @param {function} props.onRecorded   (blob, filename) => Promise
 */
export default function OralRecorder({
  prepSeconds = 15,
  maxSeconds = 90,
  uploaded = false,
  busy = false,
  onRecorded
}) {
  const [support] = useState(detectSupport);
  const [phase, setPhase] = useState("idle"); // idle | prep | recording | review
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState("");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const objectUrlRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Tear everything down on unmount: the mic indicator must not linger and
  // object URLs would otherwise leak.
  useEffect(() => {
    return () => {
      clearTimer();
      releaseStream();
      if (recorderRef.current?.state === "recording") {
        try { recorderRef.current.stop(); } catch { /* already stopping */ }
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const stopRecording = useCallback(() => {
    clearTimer();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop(); // fires onstop, which builds the blob
    }
  }, []);

  const beginRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        releaseStream();
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(blob);
        setAudioUrl(objectUrlRef.current);
        setPhase("review");
      };

      recorder.start();
      setElapsed(0);
      setPhase("recording");

      // Enforce the per-question cap.
      timerRef.current = setInterval(() => {
        setElapsed((previous) => {
          const next = previous + 1;
          if (next >= maxSeconds) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      releaseStream();
      setPhase("idle");
      setError(
        err.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow mic access in your browser settings, then try again."
          : err.name === "NotFoundError"
          ? "No microphone was found. Plug one in or check your system settings."
          : `Could not start recording: ${err.message}`
      );
    }
  }, [maxSeconds, stopRecording]);

  // Thinking time before recording kicks off automatically.
  const startPrep = () => {
    setError("");
    if (!prepSeconds) return beginRecording();

    setPhase("prep");
    setCountdown(prepSeconds);
    timerRef.current = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          clearTimer();
          beginRecording();
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  };

  const discard = () => {
    clearTimer();
    blobRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAudioUrl(null);
    setElapsed(0);
    setPhase("idle");
  };

  const save = async () => {
    if (!blobRef.current) return;
    setError("");
    try {
      const extension = extensionFor(blobRef.current.type);
      await onRecorded?.(blobRef.current, `answer.${extension}`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!support.ok) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        <p className="font-semibold">🎤 Recording unavailable</p>
        <p className="mt-1">{support.reason}</p>
      </div>
    );
  }

  const remaining = Math.max(0, maxSeconds - elapsed);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      {/* ---- Idle ---- */}
      {phase === "idle" && (
        <div className="text-center">
          <button
            type="button"
            onClick={startPrep}
            disabled={busy}
            className="btn btn-primary !py-3 text-sm disabled:opacity-60"
          >
            🎤 {uploaded ? "Record again" : "Start recording"}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            {prepSeconds > 0 && `${prepSeconds}s to think, then `}
            up to {formatClock(maxSeconds)} to answer
          </p>
          {uploaded && (
            <p className="mt-2 text-xs font-semibold text-green-700">
              ✓ An answer is already saved — recording again replaces it.
            </p>
          )}
        </div>
      )}

      {/* ---- Prep countdown ---- */}
      {phase === "prep" && (
        <div className="text-center">
          <p className="font-display text-4xl font-bold text-german-red tabular-nums">{countdown}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">Get ready — recording starts automatically…</p>
          <button
            type="button"
            onClick={() => {
              clearTimer();
              beginRecording();
            }}
            className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-german-red"
          >
            Skip the wait and start now
          </button>
        </div>
      )}

      {/* ---- Recording ---- */}
      {phase === "recording" && (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-german-red" aria-hidden="true" />
            <p className="font-display text-2xl font-bold tabular-nums text-slate-900">{formatClock(elapsed)}</p>
            <span className="text-xs text-slate-500">/ {formatClock(maxSeconds)}</span>
          </div>

          {/* Time remaining */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-german-red transition-all duration-1000"
              style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500" role="status">
            Recording — {formatClock(remaining)} left. Speak clearly in German.
          </p>

          <button type="button" onClick={stopRecording} className="btn btn-outline mt-4 !py-2.5 text-sm">
            ⏹ Stop &amp; review
          </button>
        </div>
      )}

      {/* ---- Review ---- */}
      {phase === "review" && (
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Listen back ({formatClock(elapsed)})
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user's own recording */}
          <audio src={audioUrl} controls className="mt-2 w-full" />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="btn btn-primary flex-1 !py-2.5 text-sm disabled:opacity-60"
            >
              {busy ? "Saving…" : uploaded ? "✓ Replace saved answer" : "✓ Save this answer"}
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="flex-1 rounded-full bg-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-60"
            >
              ↻ Record again
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}
