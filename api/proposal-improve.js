export const config = { maxDuration: 30 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { section_name, section_content, rfp_context, agency, vertical, action } = req.body || {};
  if (!section_content || !action) return res.status(400).json({ error: 'Missing section_content or action' });

  const context = 'RFP: ' + (rfp_context||'').slice(0,1000) + '\nAgency: ' + (agency||'') + '\nVertical: ' + (vertical||'') + '\nSection: ' + (section_name||'');

  try {
    if (action === 'improve') {
      const improved = await callClaude(
        context + '\n\nSection to improve:\n' + section_content,
        'You are a senior proposal writer for HGI. Improve this section: more specific, more compelling, evaluator-aligned. Use real HGI past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years. Remove generic language. Add metrics and outcomes. Return only the improved section text.'
      );
      return res.status(200).json({ improved });
    }
    if (action === 'redteam') {
      const findings = await callClaude(
        context + '\n\nSection to red team:\n' + section_content,
        'You are a ruthless proposal evaluator. Find every weakness, vague claim, gap, and missing requirement. Return a numbered list of specific issues with fixes.'
      );
      return res.status(200).json({ redteam_findings: findings });
    }
    if (action === 'both') {
      const improved = await callClaude(context + '\n\nImprove:\n' + section_content, 'You are a senior proposal writer for HGI. Improve this section. Use real HGI past performance. Return only improved text.');
      const findings = await callClaude(context + '\n\nRed team this:\n' + improved, 'You are a ruthless evaluator. Find every weakness. Return numbered list with fixes.');
      return res.status(200).json({ improved, redteam_findings: findings });
    }
    return res.status(400).json({ error: 'action must be improve, redteam, or both' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}