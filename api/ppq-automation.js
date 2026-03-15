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

  const HGI_PP = 'HGI verified past performance:\n1. Road Home Program — $12B CDBG-DR, 130K+ homeowners, Louisiana, Program Manager\n2. BP Gulf Coast Claims Facility — 1M+ claims processed, $20B fund, Kenneth Feinberg appointed\n3. PBGC — 34M beneficiaries, 50-person team, 5+ years, federal\n4. TPCIGA — Texas Property & Casualty Insurance Guaranty Association, 28 years, TPA\n5. Restore Louisiana — Hurricane Harvey, Texas GLO, CDBG-DR\n6. Louisiana Workforce Commission — unemployment adjudication, case management\n7. City of New Orleans — Workers Comp TPA, $283K/month, 15+ years\n8. SWBNO — Billing dispute appeals, $200K/month\n9. Terrebonne Parish — Hurricane Ida response, construction management\n10. LIGA — Louisiana Insurance Guaranty Association, TPA';

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