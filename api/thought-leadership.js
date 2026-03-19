export const config = { maxDuration: 30 };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function callClaude(prompt, system, max_tokens=2000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens, system: system||'You are HGI\'s thought leadership writer.', messages: [{ role: 'user', content: prompt }] })
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('') || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, topic, audience, format, length } = req.body || {};

  const HGI_VOICE = 'You are writing on behalf of Hammerman & Gainer LLC (HGI), a 95-year-old 100% minority-owned Louisiana-based government consulting firm founded in 1929. Specialties: disaster recovery, FEMA Public Assistance, CDBG-DR, TPA/claims administration, workforce services, property tax appeals, construction management, housing/HUD. CONFIRMED past performance to cite: Road Home Program ($67M direct / $13B+ program administered, 2006-2015, zero misappropriation, 185,000+ applications); Restore Louisiana ($42.3M CDBG-DR post-2016 flood); BP GCCF ($1.65M, 1M+ claims for Presidential Appointee Kenneth Feinberg, 2010-2013); City of New Orleans workers comp TPA ($283K/mo, active); TPSD construction management ($2.96M, 2022-2025, recently completed). DO NOT cite PBGC, TPCIGA, or LIGA without explicit confirmation. Write in an authoritative, specific, relationship-forward tone. Never use generic consulting language.';

  try {
    if (action === 'article') {
      const txt = await callClaude(
        'Write a thought leadership article for HGI on this topic: ' + topic + '\nAudience: ' + (audience||'government agency procurement officers and emergency management directors') + '\nLength: ' + (length||'600-800 words') + '\nFormat: ' + (format||'article with subheadings') + '\n\nDraw on HGI\'s real experience. Include specific examples from Road Home, BP GCCF, PBGC, TPCIGA. Position HGI as the authoritative voice in disaster recovery program administration.',
        HGI_VOICE, 3000
      );
      return res.status(200).json({ content: txt, type: 'article', topic });
    }

    if (action === 'linkedin') {
      const txt = await callClaude(
        'Write a LinkedIn post for HGI on: ' + topic + '\nTone: professional, insightful, not salesy. 150-250 words. End with a question to drive engagement. Draw on HGI real experience.',
        HGI_VOICE, 800
      );
      return res.status(200).json({ content: txt, type: 'linkedin', topic });
    }

    if (action === 'capability_statement') {
      const txt = await callClaude(
        'Write a one-page capability statement for HGI targeting: ' + (audience||'disaster recovery procurement officers') + '. Include: company overview, core capabilities, past performance highlights, differentiators, contact info placeholder. Format as a professional document.',
        HGI_VOICE, 2000
      );
      return res.status(200).json({ content: txt, type: 'capability_statement' });
    }

    if (action === 'white_paper_outline') {
      const txt = await callClaude('Create a detailed white paper outline for HGI on: ' + topic + '. Include 6-8 sections with key points for each.', HGI_VOICE, 1500);
      return res.status(200).json({ content: txt, type: 'white_paper_outline', topic });
    }

    return res.status(400).json({ error: 'action must be article, linkedin, capability_statement, or white_paper_outline' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}