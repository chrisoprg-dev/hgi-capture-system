export const config = { maxDuration: 60 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var token = process.env.APIFY_API_TOKEN;
  if (!token) return res.status(500).json({ error: 'APIFY_API_TOKEN not set', ts: Date.now() });
  try {
    // Step 1: Trigger a new build from latest GitHub source
    var buildUrl = 'https://api.apify.com/v2/acts/' + ACTOR_ID + '/builds?token=' + token + '&version=0.0&useCache=false';
    var br = await fetch(buildUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var bd = {};
    try { bd = await br.json(); } catch(e) {}
    var buildId = (bd.data && bd.data.id) || null;
    var buildStatus = (bd.data && bd.data.status) || null;
    // Step 2: Wait for build to finish (poll up to 45 seconds)
    var finalStatus = buildStatus;
    if (buildId && br.ok) {
      for (var i = 0; i < 15; i++) {
        await new Promise(function(r2) { setTimeout(r2, 3000); });
        try {
          var checkR = await fetch('https://api.apify.com/v2/actor-builds/' + buildId + '?token=' + token);
          var checkD = await checkR.json();
          finalStatus = (checkD.data && checkD.data.status) || finalStatus;
          if (finalStatus === 'SUCCEEDED' || finalStatus === 'FAILED' || finalStatus === 'ABORTED') break;
        } catch(e2) {}
      }
    }
    // Step 3: If build succeeded, trigger a run
    var runResult = null;
    if (finalStatus === 'SUCCEEDED') {
      var rr = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var rd = {};
      try { rd = await rr.json(); } catch(e) {}
      runResult = { triggered: rr.ok, runId: (rd.data && rd.data.id) || null, runStatus: (rd.data && rd.data.status) || null };
    }
    return res.json({ buildOk: br.ok, buildId: buildId, buildStatus: finalStatus, run: runResult, ts: Date.now() });
  } catch(e) { return res.status(500).json({ error: e.message, ts: Date.now() }); }
}