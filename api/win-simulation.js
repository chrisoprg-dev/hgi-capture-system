export const config = { maxDuration: 30 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system: 'You are a government contracting win probability analyst. Return JSON only.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // OPI Calibration — compare OPI scores to actual outcomes
    try {
      const r = await fetch(SB + '/rest/v1/opportunities?stage=in.(won,lost)&select=title,opi_score,stage,vertical,estimated_value&limit=100', { headers: H });
      const data = await r.json();
      if (!data || data.length === 0) return res.status(200).json({ calibration: 'insufficient_data', message: 'Need won/lost outcomes to calibrate. Update opportunity stages to won or lost.' });
      const won = data.filter(o => o.stage === 'won');
      const lost = data.filter(o => o.stage === 'lost');
      const avgOpiWon = won.length ? Math.round(won.reduce((s,o)=>s+(o.opi_score||0),0)/won.length) : 0;
      const avgOpiLost = lost.length ? Math.round(lost.reduce((s,o)=>s+(o.opi_score||0),0)/lost.length) : 0;
      return res.status(200).json({ win_rate: won.length/(won.length+lost.length)*100, avg_opi_won: avgOpiWon, avg_opi_lost: avgOpiLost, sample_size: data.length, calibration_health: avgOpiWon > avgOpiLost ? 'GOOD — OPI predicting wins correctly' : 'NEEDS_RECALIBRATION — OPI not differentiating wins from losses' });
    } catch(e) { return res.status(200).json({ error: e.message }); }
  }

  if (req.method === 'POST') {
    const { title, agency, vertical, opi_score, competitors, incumbent, relationship_strength, budget_certainty, hgi_pp_match, evaluation_weights, notes } = req.body || {};

    const prompt = 'Run a win probability simulation for HGI. Return ONLY valid JSON.\n\nOpportunity: ' + (title||'Unknown') + '\nAgency: ' + (agency||'Unknown') + '\nVertical: ' + (vertical||'disaster') + '\nCurrent OPI Score: ' + (opi_score||50) + '\nKnown Competitors: ' + (competitors||'Unknown') + '\nIncumbent: ' + (incumbent||'Unknown') + '\nRelationship Strength: ' + (relationship_strength||'Cold') + '\nBudget Certainty: ' + (budget_certainty||5) + '/10\nHGI PP Match: ' + (hgi_pp_match||5) + '/10\nEvaluation Weights: ' + JSON.stringify(evaluation_weights||{price:30,technical:40,past_performance:20,management:10}) + '\nNotes: ' + (notes||'') + '\n\nHGI STRENGTHS: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, 95 years, Louisiana relationships.\n\nReturn JSON: { pwin: number 0-100, opi_recommended: number 0-100, win_scenarios: [{scenario, probability, key_factor}], lose_scenarios: [{scenario, probability, risk}], top_3_actions: [string], price_positioning: string, relationship_recommendation: string }';

    try {
      const raw = await callClaude(prompt);
      const clean = raw.replace(/```json|```/g,'').trim();
      const result = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}')+1));
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: 'Simulation failed: ' + e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}