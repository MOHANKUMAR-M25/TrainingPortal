// ============================================================
// Candidate ID (CID) generator — unique per student.
// Format: CID-YYYY-XXXXXX  (e.g. CID-2026-4F9A2C)
// Uniqueness is enforced by the DB (students.cid UNIQUE); we
// also retry a few times on the rare collision.
// ============================================================

import { supabase } from "./db.js";

function randomBlock() {
  // 6 uppercase hex-ish chars
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function buildCid() {
  const year = new Date().getFullYear();
  return `CID-${year}-${randomBlock()}`;
}

/**
 * Generate a unique Candidate ID. If Supabase is available we
 * check for collisions; otherwise we return a fresh random one.
 */
export async function generateUniqueCid() {
  if (!supabase) return buildCid();

  for (let attempt = 0; attempt < 6; attempt++) {
    const cid = buildCid();
    const { data, error } = await supabase.from("students").select("cid").eq("cid", cid).maybeSingle();
    if (error) {
      // If the lookup fails (e.g. column missing), just return the candidate.
      console.warn("⚠️ CID uniqueness check failed:", error.message);
      return cid;
    }
    if (!data) return cid; // not taken
  }
  // Extremely unlikely fallback — add a timestamp suffix
  return `${buildCid()}-${Date.now().toString(36).toUpperCase()}`;
}
