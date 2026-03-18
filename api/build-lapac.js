export const config = { maxDuration: 30 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.APIFY_API_TOKEN;
  const r = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/builds?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: '0.0', tag: 'latest' })
  });
  const d = await r.json();
  return res.json({ ok: r.ok, buildId: d.data?.id, status: d.data?.status, error: d.error, full: d, ts: Date.now() });
}