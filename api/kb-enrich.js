// api/kb-enrich.js — Auto-feeds high-scoring proposal sections into the HGI KB
// Triggered by sonnet-work after Opus writes an improved draft.
// Uses the gate output to identify which sections scored 8+/10, then ingests them.
export const config = { maxDuration: 60 };
const AK = process.env.ANTHROPIC_API_KEY;
const IS = process.env.INTAKE_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    var body = req.body || {};
    var proposal = body.proposal || '';
    var gateOutput = body.gate_output || '';
    var vertical = body.vertical || 'general';
    var oppTitle = body.opp_title || 'Unknown Opportunity';
    var agency = body.agency || '';

    if (proposal.length < 500) return res.status(200).json({ skipped: true, reason: 'proposal too short' });
    if (gateOutput.length < 100) return res.status(200).json({ skipped: true, reason: 'no gate output to guide extraction' });

    // Step 1: Use Haiku to identify which sections scored 8+ and extract them
    var extractR = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        system: 'You extract high-quality proposal sections for reuse in future government proposals. You receive a proposal and a quality gate review. Your job is to identify the sections that scored 8 or higher out of 10 in the gate review, then extract those sections verbatim from the proposal. Format your output clearly: start each section with === SECTION: [section name] === then the full text. Only include sections with strong gate scores. If no sections clearly scored 8+, extract the 2 strongest sections regardless.',
        messages: [{ role: 'user', content:
          '=== QUALITY GATE REVIEW (use this to identify high-scoring sections) ===\n' + gateOutput.slice(0, 2000) +
          '\n\n=== FULL PROPOSAL DRAFT ===\n' + proposal.slice(0, 20000) +
          '\n\nExtract every section that scored 8+/10 in the gate review. Include the full text of each section verbatim. Start each with === SECTION: [name] ==='
        }]
      })
    });

    if (!extractR.ok) return res.status(200).json({ skipped: true, reason: 'haiku extraction failed: ' + extractR.status });
    var extractD = await extractR.json();
    var extracted = (extractD.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('');
    if (!extracted || extracted.length < 200) return res.status(200).json({ skipped: true, reason: 'no high-scoring sections found' });

    // Step 2: Build KB document with metadata header
    var verticalMap = { disaster: 'disaster', tpa: 'tpa', appeals: 'appeals', workforce: 'workforce', construction: 'construction', housing: 'disaster', grant: 'disaster', federal: 'federal' };
    var kbVertical = verticalMap[vertical.toLowerCase()] || 'general';
    var now = new Date().toISOString().slice(0, 10);
    var docContent =
      'SOURCE: HGI Proposal — ' + oppTitle + ' | ' + agency + '\n' +
      'DATE: ' + now + '\n' +
      'VERTICAL: ' + vertical + '\n' +
      'QUALITY: Sections scored 8+/10 by quality gate — high-confidence reuse material\n' +
      '---\n\n' + extracted;

    var kbFilename = 'proposal_sections_' + agency.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) + '_' + Date.now() + '.txt';

    // Step 3: POST to knowledge.js — full KB ingestion pipeline
    var kbR = await fetch('https://hgi-capture-system.vercel.app/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: kbFilename,
        file_type: 'txt',
        content_text: docContent,
        vertical: kbVertical,
        document_class: 'winning_proposal',
        client: agency,
        contract_name: oppTitle,
        intake_secret: IS
      })
    });

    if (!kbR.ok) return res.status(200).json({ skipped: true, reason: 'knowledge ingest failed: ' + kbR.status });
    var kbD = await kbR.json();

    return res.status(200).json({
      success: true,
      doc_id: kbD.id,
      filename: kbFilename,
      chunk_count: kbD.chunk_count,
      extracted_chars: extracted.length,
      vertical: kbVertical,
      opp: oppTitle
    });

  } catch(e) {
    return res.status(200).json({ skipped: true, reason: e.message });
  }
}