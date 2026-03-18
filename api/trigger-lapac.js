export const config = { maxDuration: 30 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.APIFY_API_TOKEN;
  // Abort all running runs first
  const runsRes = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token + '&status=RUNNING&limit=10');
  const runsData = await runsRes.json();
  const running = runsData.data?.items || [];
  const aborted = [];
  for (const run of running) {
    await fetch('https://api.apify.com/v2/actor-runs/' + run.id + '/abort?token=' + token, { method: 'POST' });
    aborted.push(run.id);
  }
  // Trigger fresh run
  const r = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const d = await r.json();
  return res.json({ aborted, triggered: r.ok, runId: d.data?.id, status: d.data?.status, actorId: ACTOR_ID });
}