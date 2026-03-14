export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-bridge-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const secret = req.headers['x-bridge-secret'];
  if (secret !== process.env.BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { instruction, filename } = req.body || {};
  if (!instruction || !filename) {
    return res.status(400).json({ error: 'instruction and filename required' });
  }

  try {
    const modifyUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}/api/modify`;
    const r = await fetch(modifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction, filename })
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
