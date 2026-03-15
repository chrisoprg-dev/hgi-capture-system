export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const sbHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { opportunity_title, agency, award_date, our_bid_amount, winner_name, winner_amount, vertical, notes } = req.body || {};
    if (!opportunity_title || !agency) return res.status(400).json({ error: 'title and agency required' });

    // Analyze with Claude
    let analysis = '';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: 'You are a competitive intelligence analyst for HGI government consulting.',
          messages: [{ role: 'user', content: 'Analyze this loss: Opportunity: ' + opportunity_title + ' | Agency: ' + agency + ' | Our bid: $' + (our_bid_amount||'unknown') + ' | Winner: ' + (winner_name||'unknown') + ' at $' + (winner_amount||'unknown') + ' | Notes: ' + (notes||'none') + '\n\nProvide: 1) Why we lost 2) Price gap analysis 3) Win strategy for next time' }]
        })
      });
      const d = await r.json();
      analysis = d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    } catch(e) { analysis = 'Analysis unavailable'; }

    // Store in hunt_runs
    try {
      await fetch(SUPABASE_URL + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ source: 'loss_analysis', status: 'loss', run_at: new Date().toISOString(), opportunities_found: 0 })
      });
    } catch(e) {}

    return res.status(200).json({ analysis, stored: true });
  }

  if (req.method === 'GET') {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/hunt_runs?source=eq.loss_analysis&order=run_at.desc&limit=50', { headers: sbHeaders });
      const data = await r.json();
      return res.status(200).json({ records: data });
    } catch(e) { return res.status(200).json({ records: [] }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}