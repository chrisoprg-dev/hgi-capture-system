// Railway Control Endpoint — permanent API access to V2 deployment
// Actions: status, redeploy, logs, health
export const config = { maxDuration: 30 };

const RW_TOKEN = 'fd275a36-6e93-4c35-a9cf-47155f0f192f';
const PROJECT_ID = 'd1c788de-c13b-4a2c-a76b-3d09f7f82145';
const SERVICE_ID = 'f504bc76-8a64-49de-a4c0-04e515d7f9e4';
const ENV_ID = '7ef1f3c8-197f-43f0-b63a-c78cd44d280a';
const V2_URL = 'https://hgi-organism-v2-production.up.railway.app';

async function railwayGQL(query, variables) {
  var r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RW_TOKEN },
    body: JSON.stringify({ query: query, variables: variables || {} })
  });
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action || (req.body || {}).action || 'status';
  var result = { action: action, timestamp: new Date().toISOString() };

  try {
    if (action === 'status') {
      // Get latest deployment + V2 health
      var d = await railwayGQL('{ deployments(first: 3, input: { serviceId: "' + SERVICE_ID + '" }) { edges { node { id status createdAt } } } }');
      var health = null;
      try { var hr = await fetch(V2_URL + '/health', { signal: AbortSignal.timeout(5000) }); health = await hr.json(); } catch(e) { health = { error: e.message }; }
      result.deployments = (d.data || {}).deployments;
      result.v2_health = health;
    }
    else if (action === 'redeploy') {
      // Trigger redeploy from latest commit
      var d = await railwayGQL('mutation { serviceInstanceRedeploy(environmentId: "' + ENV_ID + '", serviceId: "' + SERVICE_ID + '") }');
      result.redeploy = d;
      result.note = 'Redeploy triggered. Check status in 60-90 seconds.';
    }
    else if (action === 'restart') {
      // Restart = same as redeploy on Railway
      var d = await railwayGQL('mutation { serviceInstanceRedeploy(environmentId: "' + ENV_ID + '", serviceId: "' + SERVICE_ID + '") }');
      result.restart = d;
      result.note = 'Restart triggered via redeploy. New code from latest commit will deploy.';
    }
    else if (action === 'logs') {
      // Get V2 application logs
      try { var lr = await fetch(V2_URL + '/api/logs', { signal: AbortSignal.timeout(5000) }); result.logs = await lr.json(); } catch(e) { result.logs = { error: e.message }; }
    }
    else if (action === 'health') {
      try { var hr = await fetch(V2_URL + '/health', { signal: AbortSignal.timeout(5000) }); result.health = await hr.json(); } catch(e) { result.health = { error: e.message }; }
    }
    else {
      result.error = 'Unknown action. Use: status, redeploy, restart, logs, health';
    }
  } catch(e) {
    result.error = e.message;
  }

  return res.status(200).json(result);
}
