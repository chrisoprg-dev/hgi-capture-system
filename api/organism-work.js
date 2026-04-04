export const config = { maxDuration: 10 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({ status: 'DISABLED', message: 'V1 organism-work disabled Session 84. All agent intelligence runs on V2 Railway (V4.5-full-intel, 29 agents).', disabled_at: '2026-04-04', v2_url: 'https://hgi-organism-v2-production.up.railway.app' });
}