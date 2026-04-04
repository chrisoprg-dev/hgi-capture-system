export const config = { maxDuration: 10 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({ status: 'DISABLED', message: 'V1 organism-think disabled Session 84. Decision engine runs on V2 Railway.', disabled_at: '2026-04-04' });
}