export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

const BENCH_RECORD_ID = 'recruiting-bench-master';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const r = await fetch(SB + '/rest/v1/knowledge_base?id=eq.' + BENCH_RECORD_ID, { headers: H });
      const data = await r.json();
      if (data && data.length > 0 && data[0].content) {
        try {
          const bench = JSON.parse(data[0].content);
          return res.status(200).json({ bench });
        } catch(e) {
          return res.status(200).json({ bench: [] });
        }
      }
      return res.status(200).json({ bench: [] });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { bench } = req.body || {};
    if (!Array.isArray(bench)) return res.status(400).json({ error: 'bench array required' });

    try {
      await fetch(SB + '/rest/v1/knowledge_base', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: BENCH_RECORD_ID,
          title: 'Recruiting Bench Master',
          doc_type: 'recruiting_bench',
          vertical: 'all',
          content: JSON.stringify(bench),
          extracted_at: new Date().toISOString()
        })
      });

      return res.status(200).json({ success: true, total: bench.length });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}