// api/extract-pdf.js — text extraction mode: fetch PDF, parse text, send text to Claude
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '50mb' } } };

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
    // Step 1: Get PDF buffer
    let pdfBuffer;
    let pdfSizeBytes = 0;
    if (base64Input) {
      pdfBuffer = Buffer.from(base64Input, 'base64');
      pdfSizeBytes = pdfBuffer.length;
      console.log('[extract-pdf] base64 input bytes:', pdfSizeBytes);
    } else {
      console.log('[extract-pdf] fetching PDF:', url);
      const pdfRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
      if (!pdfRes.ok) return res.status(502).json({ error: 'PDF fetch failed: ' + pdfRes.status, url });
      const buf = await pdfRes.arrayBuffer();
      pdfBuffer = Buffer.from(buf);
      pdfSizeBytes = pdfBuffer.length;
      console.log('[extract-pdf] fetched PDF bytes:', pdfSizeBytes);
    }

    // Step 2: Extract text from PDF using pdf-parse
    let rawText = '';
    try {
      const parsed = await pdfParse(pdfBuffer);
      rawText = parsed.text || '';
      console.log('[extract-pdf] pdf-parse extracted chars:', rawText.length);
    } catch (parseErr) {
      console.error('[extract-pdf] pdf-parse error:', parseErr.message);
      return res.status(502).json({ error: 'PDF parse failed: ' + parseErr.message, url });
    }

    if (!rawText || rawText.trim().length < 50) {
      return res.status(502).json({ error: 'PDF text extraction empty — may be scanned/image PDF', url });
    }

    // Step 3: Send extracted text to Claude (cap at 15K chars — ~4K tokens, well within limit)
    const textForClaude = rawText.substring(0, 15000);
    console.log('[extract-pdf] sending', textForClaude.length, 'chars to Claude');

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
          content: 'Extract procurement details from this government RFP/solicitation text. Return in EXACTLY this format with no markdown headers or extra formatting:\nTITLE: [exact solicitation title]\nAGENCY: [issuing agency name]\nDEADLINE: [due date if found, or NONE]\nSCOPE: [1-2 sentence scope summary]\nKEY REQUIREMENTS: [comma-separated key requirements]\n\nIMPORTANT: The TITLE line must contain the actual name of the solicitation, not a generic label. If no clear title, use the solicitation/bid number.\n\n' + textForClaude
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
    console.log('[extract-pdf] final extracted chars:', extractedText.length);

    // Parse structured fields from Claude output
    var parsed = {};
    var titleM = extractedText.match(/TITLE:\s*(.+)/i);
    var agencyM = extractedText.match(/AGENCY:\s*(.+)/i);
    var deadlineM = extractedText.match(/DEADLINE:\s*(.+)/i);
    var scopeM = extractedText.match(/SCOPE:\s*(.+)/i);
    if (titleM) parsed.title = titleM[1].trim();
    if (agencyM) parsed.agency = agencyM[1].trim();
    if (deadlineM && deadlineM[1].trim().toUpperCase() !== 'NONE') parsed.deadline = deadlineM[1].trim();
    if (scopeM) parsed.scope = scopeM[1].trim();

    return res.json({ success: true, url, extractedText, parsed, charCount: extractedText.length, pdfSizeBytes, rawTextChars: rawText.length });

  } catch (e) {
    console.error('[extract-pdf] catch error:', e.message);
    return res.status(500).json({ error: e.message, url });
  }
}