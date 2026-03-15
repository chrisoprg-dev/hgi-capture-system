export const config = { maxDuration: 30 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: 'You are HGI teaming strategy analyst. Be specific and actionable.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // Return stored teaming partners from hunt_runs where source='teaming_partner'
    const r = await fetch(SB + '/rest/v1/hunt_runs?source=eq.teaming_partner&order=run_at.desc&limit=50', { headers: H });
    const data = await r.json();
    return res.status(200).json({ partners: data || [] });
  }

  if (req.method === 'POST') {
    const { action, opportunity_title, agency, vertical, set_aside, naics, value, scope } = req.body || {};

    if (action === 'analyze') {
      // Analyze whether HGI should prime or sub, and who to team with
      const txt = await callClaude(
        'Teaming analysis for HGI on this opportunity:\nTitle: ' + (opportunity_title||'Unknown') + '\nAgency: ' + (agency||'Unknown') + '\nVertical: ' + (vertical||'disaster') + '\nSet-Aside: ' + (set_aside||'None') + '\nNAICS: ' + (naics||'541611') + '\nValue: ' + (value||'Unknown') + '\nScope: ' + (scope||'').slice(0,500) + '\n\nHGI capabilities: disaster recovery, FEMA PA, CDBG-DR, TPA/claims, workforce services, property tax appeals. Louisiana-based. NOT a construction firm. NOT an IT firm.\n\nProvide:\n1. PRIME vs SUB recommendation with reasoning\n2. Top 5 potential teaming partners for this specific opportunity (real firms active in this space: ICF, Hagerty, Witt O\'Brien\'s, Dewberry, CDM Smith, APTIM, Tetra Tech, Baker Tilly, RSM, local Louisiana firms)\n3. For each partner: their role, why they complement HGI, risk of teaming with them\n4. Set-aside strategy if applicable\n5. Teaming outreach script — first email to a potential partner'
      );
      return res.status(200).json({ analysis: txt });
    }

    if (action === 'save_partner') {
      // Save a teaming partner to the database
      const { partner_name, partner_role, capabilities, contact, notes } = req.body;
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ source: 'teaming_partner', status: partner_role||'potential', run_at: new Date().toISOString(), opportunities_found: 0 })
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'action must be analyze or save_partner' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}