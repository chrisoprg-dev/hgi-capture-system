// api/delete-records.js - DISABLED Session 110 for security
// Previously: no-auth DELETE of 12 hardcoded knowledge_documents IDs via GET or POST.
// Target list did not exist in current KB at time of audit (verified 2026-04-17) but endpoint was
// a loaded destructive vector. Retired during V1 audit. Do not restore without: (1) endpoint auth,
// (2) parameterized target list via request body, (3) dry-run mode, (4) explicit confirm=yes param,
// (5) POST-only method restriction.

export default function handler(req, res) {
  return res.status(410).json({
    status: 'DISABLED',
    message: 'delete-records endpoint retired for security during V1 audit Session 110. Destructive bulk-delete was unauthenticated with hardcoded targets.',
    disabled_at: '2026-04-17'
  });
}
