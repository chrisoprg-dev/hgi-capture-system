export const config = { maxDuration: 30 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.APIFY_API_TOKEN;
  const aborted = [];
  // Abort all RUNNING and READY runs
  for (const status of ['RUNNING', 'READY']) {
    const runsRes = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token + '&status=' + status + '&limit=10');
    const runsData = await runsRes.json();
    const runs = runsData.data?.items || [];
    for (const run of runs) {
      const abortRes = await fetch('https://api.apify.com/v2/actor-runs/' + run.id + '/abort?token=' + token, { method: 'POST' });
      aborted.push({ id: run.id, status: run.status, abortOk: abortRes.ok });
    }
  }
  // Small delay to let aborts register
  await new Promise(r => setTimeout(r, 2000));
  // Trigger fresh run
  const r = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const d = await r.json();
  return res.json({ aborted, triggered: r.ok, runId: d.data?.id, status: d.data?.status, actorId: ACTOR_ID });
}