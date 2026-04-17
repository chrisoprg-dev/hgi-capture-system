// api/run-delete.js - DISABLED Session 110 for security
// Previously: no-auth GET wrapper that proxied to /api/delete-records (retired same session).
// Retired during V1 audit. No restoration path — if deletion tooling is needed, build a properly
// authenticated /api/documents DELETE with parameterized input.

export default function handler(req, res) {
  return res.status(410).json({
    status: 'DISABLED',
    message: 'run-delete endpoint retired Session 110 alongside its proxy target /api/delete-records.',
    disabled_at: '2026-04-17'
  });
}
