export const config = { maxDuration: 30 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.APIFY_API_TOKEN;
  const r = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const d = await r.json();
  return res.json({ triggered: r.ok, runId: d.data?.id, status: d.data?.status, actorId: ACTOR_ID });
}