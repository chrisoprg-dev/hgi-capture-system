export const config = { maxDuration: 10 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    var r = await fetch('https://hgi-capture-system.vercel.app/api/organism-work', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'manual_session27' })
    });
    return res.status(200).json({ triggered: true, status: r.status, message: 'organism-work fired — check hunt_runs in 2-4 minutes for results' });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}