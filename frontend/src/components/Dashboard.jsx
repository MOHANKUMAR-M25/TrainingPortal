// ============================================================
// Admin Dashboard — visible only to admins. Shows all analytics
// stored in Supabase: visitors, students, contacts/callbacks,
// half-filled forms, bookings and payments (success/failed).
// ============================================================

import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";

const INR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");

function Stat({ label, value, color = "text-slate-900", icon }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`mt-2 font-display text-3xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

function Table({ columns, rows, empty }) {
  if (!rows?.length) return <p className="p-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-slate-50 hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-700">
                  {c.render ? c.render(r) : r[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const StatusPill = ({ status }) => {
  const map = {
    captured: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    booked: "bg-green-100 text-green-700",
    active: "bg-green-100 text-green-700",
    graded: "bg-green-100 text-green-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    revoked: "bg-red-100 text-red-700",
    submitted: "bg-blue-100 text-blue-700",
    callback_requested: "bg-purple-100 text-purple-700",
    attempted: "bg-yellow-100 text-yellow-700",
    created: "bg-yellow-100 text-yellow-700",
    abandoned: "bg-slate-200 text-slate-600",
    failed: "bg-red-100 text-red-700",
    payment_failed: "bg-red-100 text-red-700"
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] || "bg-slate-100 text-slate-600"}`}>{status}</span>;
};

const TABS = ["Overview", "Visitors", "Students", "Enrollments", "Contacts", "Bookings", "Payments"];

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  // Every student's enrollment + progress + assessment status
  const [enrollments, setEnrollments] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.admin.getDashboard().then(setData),
      api.admin
        .getStudentsOverview()
        .then((res) => setEnrollments(res.rows || []))
        .catch(() => setEnrollments([]))
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) return null;

  const s = data?.stats || {};

  return (
    <section id="dashboard" className="bg-slate-900 py-16">
      <div className="container-site">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">📊 Admin Dashboard</h2>
            <p className="mt-1 text-sm text-slate-400">
              Live analytics from Supabase — visitors, leads, bookings and payments.
            </p>
          </div>
          <button onClick={load} className="btn btn-gold !py-2 text-sm">🔄 Refresh</button>
        </div>

        {data && !data.configured && (
          <p className="mt-6 rounded-xl bg-yellow-500/10 p-4 text-sm text-yellow-300">
            ⚠️ {data.note}
          </p>
        )}
        {error && <p className="mt-6 rounded-xl bg-red-500/10 p-4 text-sm text-red-300">{error}</p>}
        {loading && <p className="mt-6 text-sm text-slate-400">Loading dashboard…</p>}

        {data && (
          <>
            {/* Tabs */}
            <div className="mt-6 flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    tab === t ? "bg-german-gold text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-white p-6">
              {tab === "Overview" && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Visitors" value={s.totalVisitors ?? 0} icon="👀" />
                  <Stat label="Students" value={s.totalStudents ?? 0} icon="🎓" />
                  <Stat
                    label="Active Enrollments"
                    value={(enrollments || []).filter((e) => e.status === "active").length}
                    color="text-green-600"
                    icon="📖"
                  />
                  <Stat label="Contacts" value={s.contactsSubmitted ?? 0} color="text-blue-600" icon="📩" />
                  <Stat label="Callback Requests" value={s.callbackRequests ?? 0} color="text-purple-600" icon="📞" />
                  <Stat label="Half-filled Forms" value={s.contactsPartial ?? 0} color="text-yellow-600" icon="✍️" />
                  <Stat label="Bookings" value={s.bookingsBooked ?? 0} color="text-green-600" icon="📅" />
                  <Stat label="Tried but didn't book" value={(s.bookingsAttempted ?? 0) + (s.bookingsAbandoned ?? 0)} color="text-slate-500" icon="🚪" />
                  <Stat label="Payments OK" value={s.paymentsCaptured ?? 0} color="text-green-600" icon="✅" />
                  <Stat label="Payments Failed" value={s.paymentsFailed ?? 0} color="text-red-600" icon="⚠️" />
                  <Stat label="Payments Pending" value={s.paymentsPending ?? 0} color="text-yellow-600" icon="⏳" />
                  <Stat label="Revenue" value={INR(s.revenue)} color="text-german-red" icon="💰" />
                </div>
              )}

              {tab === "Visitors" && (
                <Table
                  empty="No visits recorded yet."
                  rows={data.visitors}
                  columns={[
                    { key: "visited_at", label: "When", render: (r) => fmt(r.visited_at) },
                    { key: "page", label: "Page" },
                    { key: "email", label: "User", render: (r) => r.email || "anonymous" },
                    { key: "referrer", label: "Referrer", render: (r) => r.referrer || "—" },
                    { key: "user_agent", label: "Device", render: (r) => (r.user_agent || "").slice(0, 40) }
                  ]}
                />
              )}

              {tab === "Students" && (
                <Table
                  empty="No students yet."
                  rows={data.students}
                  columns={[
                    {
                      key: "cid",
                      label: "Candidate ID",
                      render: (r) => (
                        <span className="rounded bg-german-gold/20 px-2 py-0.5 font-mono text-xs font-bold text-yellow-700">
                          {r.cid || "—"}
                        </span>
                      )
                    },
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                    { key: "auth_provider", label: "Via" },
                    { key: "created_at", label: "Joined", render: (r) => fmt(r.created_at) }
                  ]}
                />
              )}

              {tab === "Enrollments" && (
                <Table
                  empty="No enrollments yet — students appear here as soon as they enroll in a course."
                  rows={enrollments || []}
                  columns={[
                    { key: "enrolledAt", label: "Enrolled", render: (r) => fmt(r.enrolledAt) },
                    { key: "name", label: "Student", render: (r) => r.name || "—" },
                    { key: "email", label: "Email" },
                    {
                      key: "courseTitle",
                      label: "Course",
                      render: (r) => (
                        <span>
                          {r.level && (
                            <span className="mr-1.5 rounded bg-german-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-700">
                              {r.level}
                            </span>
                          )}
                          {r.courseTitle}
                        </span>
                      )
                    },
                    {
                      key: "progress",
                      label: "Progress",
                      render: (r) => (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                            <span
                              className={`block h-full ${r.progressPercent === 100 ? "bg-green-500" : "bg-german-red"}`}
                              style={{ width: `${r.progressPercent}%` }}
                            />
                          </span>
                          <span className="text-xs font-semibold">
                            {r.modulesCompleted}/{r.modulesTotal} ({r.progressPercent}%)
                          </span>
                        </span>
                      )
                    },
                    {
                      key: "assessment",
                      label: "Assessment",
                      render: (r) =>
                        r.assessmentStatus ? (
                          <span className="flex items-center gap-1.5">
                            <StatusPill status={r.assessmentStatus} />
                            {r.assessmentPercent != null && (
                              <span className={`text-xs font-bold ${r.assessmentPassed ? "text-green-600" : "text-slate-500"}`}>
                                {r.assessmentPercent}%{r.assessmentPassed ? " ✅" : ""}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Not started</span>
                        )
                    },
                    { key: "source", label: "Via", render: (r) => (r.source === "manual" ? "Admin grant" : "Payment") },
                    { key: "status", label: "Access", render: (r) => <StatusPill status={r.status} /> }
                  ]}
                />
              )}

              {tab === "Contacts" && (
                <Table
                  empty="No contact submissions or callback requests yet."
                  rows={data.contacts}
                  columns={[
                    { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
                    { key: "name", label: "Name" },
                    { key: "email", label: "Email", render: (r) => r.email || "—" },
                    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
                    { key: "status", label: "Type", render: (r) => <StatusPill status={r.status} /> },
                    { key: "message", label: "Message", render: (r) => (r.message || "").slice(0, 50) }
                  ]}
                />
              )}

              {tab === "Bookings" && (
                <Table
                  empty="No bookings yet."
                  rows={data.bookings}
                  columns={[
                    { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
                    { key: "name", label: "Student" },
                    { key: "email", label: "Email" },
                    { key: "session_name", label: "Session" },
                    { key: "amount", label: "Amount", render: (r) => INR(r.amount) },
                    { key: "slot_start", label: "Slot", render: (r) => fmt(r.slot_start) },
                    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }
                  ]}
                />
              )}

              {tab === "Payments" && (
                <Table
                  empty="No payments yet."
                  rows={data.payments}
                  columns={[
                    { key: "created_at", label: "When", render: (r) => fmt(r.created_at) },
                    { key: "name", label: "Name", render: (r) => r.name || "—" },
                    { key: "email", label: "Email", render: (r) => r.email || "—" },
                    { key: "amount", label: "Amount", render: (r) => INR(r.amount) },
                    { key: "razorpay_payment_id", label: "Payment ID", render: (r) => r.razorpay_payment_id || "—" },
                    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
                    { key: "error_reason", label: "Note", render: (r) => (r.error_reason || "").slice(0, 40) }
                  ]}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
