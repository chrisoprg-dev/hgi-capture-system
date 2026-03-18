// api/extract-pdf.js — URL source mode v2
export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '10mb' } } };

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.json({ status: 'ok', hasKey: !!ANTHROPIC_KEY, keyPrefix: (ANTHROPIC_KEY || '').substring(0, 8) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url, base64: base64Input } = req.body || {};
  if (!url && !base64Input) return res.status(400).json({ error: 'url or base64 required' });

  try {
    let documentSource;
    let pdfSizeBytes = 0;

    if (url && !base64Input) {
      // Use URL source type — Claude fetches the PDF directly, no token limit issue
      console.log('[extract-pdf] using URL source:', url);
      documentSource = { type: 'url', url };
      pdfSizeBytes = -1; // unknown until Claude fetches
    } else {
      // Fall back to base64 if explicitly provided
      pdfSizeBytes = Math.round(base64Input.length * 0.75);
      console.log('[extract-pdf] base64 input, approx bytes:', pdfSizeBytes);
      documentSource = { type: 'base64', media_type: 'application/pdf', data: base64Input };
    }

    console.log('[extract-pdf] calling Claude with source type:', documentSource.type);
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: documentSource },
            { type: 'text', text: 'Extract key procurement details from this RFP: title, issuing agency, deadline/due date, scope of work summary, key requirements. Return as plain text, concise.' }
          ]
        }]
      })
    });

    console.log('[extract-pdf] Claude status:', claudeRes.status);
    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('[extract-pdf] Claude error:', errText.substring(0, 500));
      return res.status(502).json({ error: 'Claude error ' + claudeRes.status, detail: errText.substring(0, 500) });
    }

    const data = await claudeRes.json();
    const extractedText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    console.log('[extract-pdf] extracted chars:', extractedText.length);

    return res.json({ success: true, url, extractedText, charCount: extractedText.length, pdfSizeBytes });

  } catch (e) {
    console.error('[extract-pdf] catch error:', e.message);
    return res.status(500).json({ error: e.message, url });
  }
}