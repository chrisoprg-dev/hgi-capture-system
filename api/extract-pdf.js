// api/extract-pdf.js
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
    let base64;
    let pdfSizeBytes = 0;
    if (base64Input) {
      base64 = base64Input;
      pdfSizeBytes = Math.round(base64Input.length * 0.75);
      console.log('[extract-pdf] base64 input, approx bytes:', pdfSizeBytes);
    } else {
      const pdfRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (!pdfRes.ok) return res.status(502).json({ error: 'PDF fetch failed: ' + pdfRes.status, url });
      const buf = await pdfRes.arrayBuffer();
      pdfSizeBytes = buf.byteLength;
      base64 = Buffer.from(buf).toString('base64');
      console.log('[extract-pdf] fetched PDF bytes:', pdfSizeBytes);
    }

    console.log('[extract-pdf] calling Claude, base64 length:', base64.length);
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extract key procurement details: title, issuing agency, deadline, scope of work, requirements. Return as plain text.' }
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