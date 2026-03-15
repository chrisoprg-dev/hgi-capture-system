export const config = { maxDuration: 30 };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

const DEFAULT_HGI_PROFILE = {
  tone: "authoritative, specific, relationship-forward, mission-driven",
  key_phrases: ["95-year track record", "zero misappropriation", "Louisiana-rooted", "crisis response", "fiduciary stewardship"],
  avoid_phrases: ["leverage synergies", "best-in-class", "cutting-edge", "world-class", "innovative solutions"],
  structure: "lead with outcomes, then evidence, then methodology",
  programs: ["Road Home $12B", "BP GCCF 1M+ claims", "PBGC 34M beneficiaries"],
  created_at: new Date().toISOString()
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${SB}/rest/v1/hunt_runs?source=eq.voice_calibration&select=*&order=created_at.desc&limit=1`, {
        method: 'GET',
        headers: H
      });

      const data = await response.json();
      
      if (data && data.length > 0) {
        return res.status(200).json({ voice_profile: data[0].results });
      } else {
        return res.status(200).json({ voice_profile: DEFAULT_HGI_PROFILE });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch voice profile' });
    }
  }

  if (req.method === 'POST') {
    const { action, sample_text, section_type, content, voice_profile } = req.body;

    if (action === 'analyze') {
      if (!sample_text) {
        return res.status(400).json({ error: 'sample_text required for analyze action' });
      }

      try {
        const prompt = `Analyze this HGI writing sample and extract voice characteristics:

Sample text:
${sample_text}

Extract and return a JSON object with these fields:
- tone: overall tone and style
- key_phrases: array of distinctive phrases or terminology HGI uses
- avoid_phrases: array of corporate jargon or phrases that don't match this voice
- structure: preferred sentence and paragraph structure patterns
- programs: any specific programs or achievements mentioned

Focus on what makes this voice distinctive and authoritative.`;

        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        const result = await anthropicResponse.json();
        const analysis = JSON.parse(result.content[0].text);
        analysis.created_at = new Date().toISOString();

        return res.status(200).json({ voice_profile: analysis });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to analyze voice sample' });
      }
    }

    if (action === 'calibrate_proposal') {
      if (!content || !voice_profile) {
        return res.status(400).json({ error: 'content and voice_profile required for calibrate_proposal action' });
      }

      try {
        const prompt = `Rewrite this proposal section to match HGI's voice profile:

Voice Profile:
- Tone: ${voice_profile.tone}
- Key phrases to incorporate: ${voice_profile.key_phrases?.join(', ')}
- Phrases to avoid: ${voice_profile.avoid_phrases?.join(', ')}
- Structure: ${voice_profile.structure}
- Reference programs when relevant: ${voice_profile.programs?.join(', ')}

Original content:
${content}

Section type: ${section_type || 'general'}

Rewrite this to sound authentically like HGI while maintaining the core information. Be specific, cite relevant experience, and avoid generic corporate language.`;

        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 3000,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        const result = await anthropicResponse.json();
        const calibrated_content = result.content[0].text;

        return res.status(200).json({ calibrated_content });
      } catch (error) {
        return res.status(500).json({ error: 'Failed to calibrate proposal content' });
      }
    }

    if (action === 'save_profile') {
      if (!voice_profile) {
        return res.status(400).json({ error: 'voice_profile required for save_profile action' });
      }

      try {
        const saveData = {
          source: 'voice_calibration',
          query: 'HGI Voice Profile',
          results: voice_profile,
          created_at: new Date().toISOString()
        };

        const response = await fetch(`${SB}/rest/v1/hunt_runs`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify(saveData)
        });

        if (response.ok) {
          return res.status(200).json({ success: true, message: 'Voice profile saved' });
        } else {
          throw new Error('Failed to save to Supabase');
        }
      } catch (error) {
        return res.status(500).json({ error: 'Failed to save voice profile' });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use: analyze, calibrate_proposal, or save_profile' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}