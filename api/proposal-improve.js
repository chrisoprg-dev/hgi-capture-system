const { Anthropic } = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { section_name, section_content, rfp_context, agency, vertical, action } = req.body;

  if (!section_name || !section_content || !action) {
    return res.status(400).json({ error: 'Missing required fields: section_name, section_content, action' });
  }

  if (!['improve', 'redteam', 'both'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be: improve, redteam, or both' });
  }

  try {
    const improvePrompt = `You are a senior proposal writer for HGI. Improve this proposal section to be more specific, more compelling, and more aligned with the RFP requirements. Use concrete HGI past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years. Remove generic language. Add specific metrics and outcomes. Return only the improved section text.

RFP Context: ${rfp_context || 'N/A'}
Agency: ${agency || 'N/A'}
Vertical: ${vertical || 'N/A'}
Section Name: ${section_name}

Section to improve:
${section_content}`;

    const redteamPrompt = `You are a proposal evaluator reviewing HGI's submission. Identify every weakness, gap, vague claim, unsubstantiated assertion, and missing requirement. Be ruthless. Return a numbered list of specific issues with suggested fixes for each.

RFP Context: ${rfp_context || 'N/A'}
Agency: ${agency || 'N/A'}
Vertical: ${vertical || 'N/A'}
Section Name: ${section_name}

Section to review:
${section_content}`;

    if (action === 'improve') {
      const improveResponse = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{ role: 'user', content: improvePrompt }]
      });

      return res.json({
        improved: improveResponse.content[0].text
      });
    }

    if (action === 'redteam') {
      const redteamResponse = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{ role: 'user', content: redteamPrompt }]
      });

      return res.json({
        redteam_findings: redteamResponse.content[0].text
      });
    }

    if (action === 'both') {
      const improveResponse = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{ role: 'user', content: improvePrompt }]
      });

      const improvedContent = improveResponse.content[0].text;

      const redteamPromptImproved = `You are a proposal evaluator reviewing HGI's submission. Identify every weakness, gap, vague claim, unsubstantiated assertion, and missing requirement. Be ruthless. Return a numbered list of specific issues with suggested fixes for each.

RFP Context: ${rfp_context || 'N/A'}
Agency: ${agency || 'N/A'}
Vertical: ${vertical || 'N/A'}
Section Name: ${section_name}

Section to review:
${improvedContent}`;

      const redteamResponse = await anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{ role: 'user', content: redteamPromptImproved }]
      });

      return res.json({
        improved: improvedContent,
        redteam_findings: redteamResponse.content[0].text
      });
    }

  } catch (error) {
    console.error('Error calling Claude API:', error);
    return res.status(500).json({ 
      error: 'Failed to process proposal improvement request',
      details: error.message 
    });
  }
};