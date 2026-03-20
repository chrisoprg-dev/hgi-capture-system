export const config = { maxDuration: 60 };

const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var body = req.body || {};
  var opportunity_id = body.opportunity_id || (req.query && req.query.opportunity_id);
  if (!opportunity_id) return res.status(400).json({ error: 'opportunity_id required' });

  try {
    var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id) + '&limit=1', { headers: H });
    var opps = await oppR.json();
    if (!opps || !opps.length) return res.status(404).json({ error: 'Opportunity not found' });
    var opp = opps[0];

    var rfpText = (opp.rfp_text || '').slice(0, 6000);
    var submission = (opp.staffing_plan || '').slice(0, 6000);
    var description = (opp.description || '').slice(0, 1000);
    var scopeAnalysis = (opp.scope_analysis || '').slice(0, 1000);

    if (!rfpText && !description) return res.status(200).json({ success: false, error: 'No RFP content found. Run orchestrator first.' });
    if (!submission) return res.status(200).json({ success: false, error: 'No submission content found. Generate proposal or briefing first.' });

    var rfpSource = rfpText || description;
    var prompt = 'You are a senior compliance reviewer performing a pre-submission quality check for HGI (Hammerman and Gainer LLC).\n\nOPPORTUNITY: ' + opp.title + '\nAGENCY: ' + opp.agency + '\n\nRFP / SOLICITATION CONTENT:\n' + rfpSource + '\n\nSCOPE ANALYSIS:\n' + scopeAnalysis + '\n\nHGI DRAFT SUBMISSION:\n' + submission + '\n\nReview the draft against RFP requirements. Classify each finding by severity:\n- DISQUALIFYING: Missing required item causing automatic rejection (missing signature, missing notarized affidavit, wrong entity, missing required exhibit)\n- HIGH: Major gap costing significant points or raising evaluator concerns\n- MEDIUM: Issue weakening the submission but not disqualifying\n- LOW: Minor polish item\n\nReturn ONLY valid JSON, no markdown:\n{\n  "overall_status": "PASS or CONDITIONAL or FAIL",\n  "submission_ready": true or false,\n  "disqualifying_count": 0,\n  "high_count": 0,\n  "medium_count": 0,\n  "low_count": 0,\n  "findings": [\n    {\n      "severity": "DISQUALIFYING or HIGH or MEDIUM or LOW",\n      "category": "Compliance or Content or Pricing or Staffing or Format or Past Performance",\n      "issue": "Brief issue title",\n      "detail": "Specific detail about what is wrong or missing",\n      "fix": "Exactly what needs to be done to resolve this"\n    }\n  ],\n  "strengths": ["things the submission does well"],\n  "ready_to_submit": "One sentence overall assessment"\n}';

    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: 'You are a senior government proposal compliance reviewer. Be thorough and specific. Flag every gap. Return only valid JSON with no markdown or preamble.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    var d = await r.json();
    var raw = (d.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
    var clean = raw.replace(/[`]{3}(json)?/g, '').trim();

    var report;
    try {
      report = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
    } catch(e) {
      return res.status(200).json({ success: false, error: 'Parse error', raw: raw.slice(0, 500) });
    }

    return res.status(200).json({
      success: true,
      opportunity_id: opportunity_id,
      opportunity_title: opp.title,
      agency: opp.agency,
      overall_status: report.overall_status,
      submission_ready: report.submission_ready,
      disqualifying_count: report.disqualifying_count || 0,
      high_count: report.high_count || 0,
      medium_count: report.medium_count || 0,
      low_count: report.low_count || 0,
      findings: report.findings || [],
      strengths: report.strengths || [],
      ready_to_submit: report.ready_to_submit || '',
      generated_at: new Date().toISOString()
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}