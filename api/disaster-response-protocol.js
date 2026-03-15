export const config = { maxDuration: 60 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function callClaude(prompt, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system: system||'You are HGI disaster response strategist.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { disaster_name, state, incident_type, declaration_date, estimated_damage, fema_declaration_number } = req.body || {};
    if (!disaster_name || !state) return res.status(400).json({ error: 'disaster_name and state required' });

    const HGI_CONTEXT = 'HGI — 95 years, disaster recovery specialists. Road Home $12B, Restore Louisiana, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years, Louisiana Workforce Commission, FEMA PA expertise, CDBG-DR administration, TPA/claims.';

    // Generate the full disaster response package in parallel
    const [brief, outreach, opportunities, timeline] = await Promise.all([
      callClaude('Generate a 48-hour disaster response brief for HGI regarding: ' + disaster_name + ' in ' + state + '. Incident: ' + (incident_type||'unknown') + '. Declaration: ' + (declaration_date||'pending') + '. Estimated damage: ' + (estimated_damage||'unknown') + '. Cover: immediate HGI positioning, which agencies will issue RFPs, estimated contract values, HGI past performance most relevant, immediate actions in next 48 hours.', HGI_CONTEXT),
      callClaude('Draft a capability outreach letter from HGI to the Governor\'s Office and relevant state emergency management agency regarding ' + disaster_name + ' in ' + state + '. Professional, specific, offers concrete HGI capabilities. Reference Road Home and TPCIGA experience.', HGI_CONTEXT),
      callClaude('List every procurement opportunity that will emerge from ' + disaster_name + ' in ' + state + ' over the next 6-18 months. For each: agency, contract type, estimated value, timeline, HGI fit score 1-10, and specific HGI win strategy. Format as a structured list.', HGI_CONTEXT),
      callClaude('Build a 90-day capture timeline for HGI responding to ' + disaster_name + '. Week by week: what to do, who to contact, what to submit, what intelligence to gather.', HGI_CONTEXT)
    ]);

    // Store the disaster response package
    try {
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ source: 'disaster_response_protocol', status: 'completed', run_at: new Date().toISOString(), opportunities_found: 1 })
      });
    } catch(e) {}

    return res.status(200).json({ disaster_name, state, brief, outreach_letter: outreach, opportunities, capture_timeline: timeline, generated_at: new Date().toISOString() });
  }

  if (req.method === 'GET') {
    // Check FEMA API for new declarations and auto-trigger response for any new ones in HGI states
    try {
      const r = await fetch("https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=5&$filter=stateCode%20in%20('LA','TX','FL','MS','AL','GA')");
      if (r.ok) {
        const d = await r.json();
        return res.status(200).json({ recent_declarations: d.DisasterDeclarationsSummaries || [], message: 'POST with disaster details to generate full response package' });
      }
    } catch(e) {}
    return res.status(200).json({ recent_declarations: [], message: 'POST with disaster details to generate full response package' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}