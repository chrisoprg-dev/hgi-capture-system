export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // We store vendors in hunt_runs with source='vendor_db' since we don't have a vendors table
  // The status field stores the trade/category, opportunities_found stores the rating

  if (req.method === 'GET') {
    const { trade, state, cert } = req.query || {};
    let url = SB + '/rest/v1/hunt_runs?source=eq.vendor_db&order=run_at.desc&limit=100';
    const r = await fetch(url, { headers: H });
    const data = await r.json();
    return res.status(200).json({ vendors: data || [] });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'add') {
      const { company_name, trade, state, certifications, contact_name, contact_email, contact_phone, notes, rating } = req.body;
      if (!company_name) return res.status(400).json({ error: 'company_name required' });
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ source: 'vendor_db', status: trade||'general', run_at: new Date().toISOString(), opportunities_found: rating||0 })
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'find_for_opportunity') {
      const { opportunity_title, scope, location, certifications_needed } = req.body;
      // Use Claude to recommend vendor categories needed
      const r2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, system: 'You are HGI procurement specialist.', messages: [{ role: 'user', content: 'For this HGI opportunity: ' + opportunity_title + '\nScope: ' + (scope||'').slice(0,500) + '\nLocation: ' + (location||'Louisiana') + '\nCertifications needed: ' + (certifications_needed||'none specified') + '\n\nList the subcontractor/vendor categories HGI needs to source, what certifications matter, and 3 example firms for each category that operate in Louisiana/Gulf Coast. Be specific.' }] })
      });
      const d = await r2.json();
      const txt = d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
      return res.status(200).json({ recommendations: txt });
    }

    return res.status(400).json({ error: 'action must be add or find_for_opportunity' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}