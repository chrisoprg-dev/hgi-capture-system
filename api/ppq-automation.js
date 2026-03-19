export const config = { maxDuration: 30 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function callClaude(prompt, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 3000, system: system||'You are HGI past performance writer.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const HGI_PP = 'HGI CONFIRMED past performance (use exactly as stated — do not alter values or add unconfirmed entries):\n1. Road Home Program — $67M direct / $13B+ program administered, Louisiana OCD, 2006-2015, zero misappropriation, 185,000+ homeowner applications, CDBG-DR Program Manager\n2. HAP (Homeowner Assistance Program) — $950M program, disaster housing recovery\n3. Restore Louisiana — $42.3M, Louisiana OCD post-2016 flood CDBG-DR, Baton Rouge region, thousands of applications, full HUD compliance\n4. Terrebonne Parish School Board (TPSD) — $2.96M, construction management, 2022-2025, recently completed\n5. St. John the Baptist Parish Sheriff — $788K\n6. Rebuild NJ — $67.7M\n7. BP Gulf Coast Claims Facility — $1.65M, 2010-2013, 1M+ claims administered for Presidential Appointee Kenneth Feinberg\n8. City of New Orleans — Workers Compensation TPA, $283K/month, active\n9. SWBNO (Sewerage and Water Board of New Orleans) — billing appeals, $200K/month\nDO NOT LIST without confirmation: PBGC, Orleans Parish School Board, LIGA, TPCIGA. DO NOT claim current FEMA PA contract.';

  if (req.method === 'GET') {
    // Return the list of available past performance references
    const ppList = HGI_PP.split('\n').filter(l => l.trim()).map(l => ({ entry: l.trim() }));
    return res.status(200).json({ past_performance: ppList });
  }

  if (req.method === 'POST') {
    const { action, rfp_context, agency, vertical, contract_type, evaluation_criteria } = req.body || {};

    if (action === 'generate_ppq') {
      const txt = await callClaude(
        'Generate a complete Past Performance Questionnaire (PPQ) response for HGI for this opportunity:\n\nAgency: ' + (agency||'Government Agency') + '\nVertical: ' + (vertical||'disaster recovery') + '\nContract Type: ' + (contract_type||'services') + '\nRFP Context: ' + (rfp_context||'').slice(0,2000) + '\nEvaluation Criteria: ' + (evaluation_criteria||'technical approach, past performance, management') + '\n\nHGI PAST PERFORMANCE:\n' + HGI_PP + '\n\nSelect the 3 most relevant past performance references and write complete PPQ entries for each including: contract name, agency, contract number (use actual if known), period of performance, contract value, scope, your role, key outcomes and metrics, relevance to this opportunity. Make it compelling and specific.',
        'You are writing past performance questionnaire responses for HGI. Use only verified facts. Be specific with metrics. Do not fabricate contract numbers — use [TBD: confirm with contracts team] for unknown numbers.'
      );
      return res.status(200).json({ ppq: txt, agency, vertical });
    }

    if (action === 'match_pp') {
      // Match the best past performance to an opportunity
      const txt = await callClaude(
        'Given this opportunity: ' + (rfp_context||'').slice(0,1000) + '\n\nFrom this past performance list:\n' + HGI_PP + '\n\nRank the top 3 most relevant past performance references and explain why each is relevant. Format as: 1. [Name] — Relevance: [explanation] — Evaluation impact: [how it helps win]',
        'You are HGI capture manager selecting past performance references.'
      );
      return res.status(200).json({ matched_pp: txt });
    }

    return res.status(400).json({ error: 'action must be generate_ppq or match_pp' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}