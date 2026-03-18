// api/extract-pdf.js — Fetch a PDF by URL and extract text via Claude
// Used by LaPAC scraper before sending to intake.
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '10mb' } } };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.json({ status: 'ok', hasKey: !!process.env.ANTHROPIC_API_KEY, keyPrefix: (process.env.ANTHROPIC_API_KEY || '').substring(0, 8) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url, base64: base64Input } = req.body || {};
  if (!url && !base64Input) return res.status(400).json({ error: 'url or base64 required' });

  try {
    // Use provided base64 directly, or fetch from URL
    let base64;
    let pdfSizeBytes = 0;
    if (base64Input) {
      base64 = base64Input;
      pdfSizeBytes = Buffer.from(base64Input, 'base64').length;
      console.log('[extract-pdf] Using provided base64, size:', pdfSizeBytes);
    } else {
      const pdfRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HGI-Capture/1.0)' },
        redirect: 'follow'
      });
      if (!pdfRes.ok) return res.status(502).json({ error: 'PDF fetch failed: ' + pdfRes.status, url });
      const pdfBuffer = await pdfRes.arrayBuffer();
      pdfSizeBytes = pdfBuffer.byteLength;
      base64 = Buffer.from(pdfBuffer).toString('base64');
    }

    // Send to Claude for extraction
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      // Note: haiku model string verified
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 }
            },
            {
              type: 'text',
              text: 'Extract all text from this RFP/solicitation document. Include: title, issuing agency, deadline/due date, scope of work, requirements, evaluation criteria, and any other key procurement details. Return as clean plain text, preserving section structure.'
            }
          ]
        }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(502).json({ error: 'Claude API error: ' + claudeRes.status, detail: err });
    }

    const claudeData = await claudeRes.json();
    const extractedText = claudeData.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.json({
      success: true,
      url,
      extractedText,
      charCount: extractedText.length,
      pdfSizeBytes
    });

  } catch (e) {
    console.error('[extract-pdf] Error:', e.message);
    return res.status(500).json({ error: e.message, url });
  }
}