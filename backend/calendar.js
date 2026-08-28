// ============================================================
// Google Calendar integration for 1-on-1 consultation bookings.
// Uses the admin's (meenupkc@gmail.com) OAuth tokens to:
//   - list free slots (via freebusy query on her primary calendar)
//   - create calendar events with the student as attendee
// Falls back to demo slots if Google credentials aren't set yet.
// ============================================================

import { google } from "googleapis";
import { createOAuthClient, adminTokens, isGoogleConfigured, ADMIN_EMAIL } from "./auth.js";

// Working hours for consultations (local time)
const WORK_START_HOUR = 9; // 09:00
const WORK_END_HOUR = 19; // 19:00
const SLOT_MINUTES = 60;
const DAYS_AHEAD = 7;

function getCalendarClient() {
  if (!adminTokens.current) return null;
  const oauth2 = createOAuthClient();
  oauth2.setCredentials(adminTokens.current);
  // Persist refreshed tokens
  oauth2.on("tokens", (tokens) => {
    adminTokens.current = { ...adminTokens.current, ...tokens };
  });
  return google.calendar({ version: "v3", auth: oauth2 });
}

function generateCandidateSlots() {
  const slots = [];
  const now = new Date();
  for (let d = 1; d <= DAYS_AHEAD; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    if (day.getDay() === 0) continue; // skip Sundays
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      const start = new Date(day);
      start.setHours(h, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(start.getMinutes() + SLOT_MINUTES);
      slots.push({ start, end });
    }
  }
  return slots;
}

/**
 * Returns available slots. If the trainer has connected her Google
 * account, real busy times from her calendar are excluded.
 */
export async function getAvailableSlots() {
  const candidates = generateCandidateSlots();

  const calendar = getCalendarClient();
  if (!calendar) {
    // Demo mode — return candidate slots, flag that calendar isn't connected
    return {
      connected: false,
      note: isGoogleConfigured()
        ? "Trainer has not connected her Google Calendar yet. Showing default availability."
        : "Google credentials not configured. Showing default availability (demo mode).",
      slots: candidates.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString()
      }))
    };
  }

  const timeMin = candidates[0].start.toISOString();
  const timeMax = candidates[candidates.length - 1].end.toISOString();

  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: "primary" }]
    }
  });

  const busy = fb.data.calendars?.primary?.busy || [];
  const free = candidates.filter((slot) => {
    return !busy.some((b) => {
      const bStart = new Date(b.start);
      const bEnd = new Date(b.end);
      return slot.start < bEnd && slot.end > bStart;
    });
  });

  return {
    connected: true,
    note: `Live availability from ${ADMIN_EMAIL}'s Google Calendar.`,
    slots: free.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() }))
  };
}

/**
 * Books a consultation: creates a Google Calendar event on the
 * trainer's calendar with the student as attendee (with Meet link).
 */
export async function bookSlot({ start, end, studentName, studentEmail, studentPhone, sessionName, notes }) {
  const calendar = getCalendarClient();

  if (!calendar) {
    // Demo mode — pretend the booking succeeded
    return {
      calendarLinked: false,
      eventLink: null,
      message:
        "Booking recorded (demo mode — Google Calendar not connected yet). " +
        "Once the trainer connects her Google account, bookings will appear on her calendar automatically."
    };
  }

  const event = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `1-on-1 German Consultation: ${sessionName} — ${studentName}`,
      description:
        `Student: ${studentName}\nEmail: ${studentEmail}\nPhone: ${studentPhone || "—"}\n` +
        `Session: ${sessionName}\nNotes: ${notes || "—"}\n\nBooked via the website.`,
      start: { dateTime: start },
      end: { dateTime: end },
      attendees: [{ email: studentEmail, displayName: studentName }],
      conferenceData: {
        createRequest: {
          requestId: `consult-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      },
      reminders: { useDefault: true }
    }
  });

  return {
    calendarLinked: true,
    eventLink: event.data.htmlLink,
    meetLink: event.data.hangoutLink || null,
    message: "Booked! A Google Calendar invite (with Meet link) has been emailed to you."
  };
}
