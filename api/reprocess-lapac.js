// api/reprocess-lapac.js — Force PDF extraction and re-scoring for a LaPAC record
// GET /api/reprocess-lapac?id=lapac-50001-2721
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BASE = 'https://hgi-capture-system.vercel.app';
  const dbHeaders = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

  // 1. Fetch the record
  const recRes = await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id) + '&select=id,source_url,status', { headers: dbHeaders });
  const recs = await recRes.json();
  if (!recs || recs.length === 0) return res.status(404).json({ error: 'Record not found', id });
  const record = recs[0];
  const pdfUrl = record.source_url;
  if (!pdfUrl || !pdfUrl.includes('.pdf')) return res.status(400).json({ error: 'No PDF URL on record', source_url: pdfUrl });

  // 2. Call extract-pdf with the URL
  const extractRes = await fetch(BASE + '/api/extract-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pdfUrl })
  });
  const extractData = await extractRes.json();
  if (!extractRes.ok || !extractData.extractedText || extractData.extractedText.length < 100) {
    return res.status(502).json({ error: 'PDF extraction failed', detail: extractData, pdfUrl });
  }

  const text = extractData.extractedText;

  // 3. Update record with real rfp_text and reset status
  await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: dbHeaders,
    body: JSON.stringify({ rfp_text: text.substring(0, 10000), status: 'pending', last_updated: new Date().toISOString() })
  });

  // 4. Fire orchestrator
  const orchRes = await fetch(BASE + '/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunity_id: id, trigger: 'manual_reprocess' })
  });
  const orchData = await orchRes.json();

  return res.json({ success: true, id, chars: text.length, pdfUrl, orchestrator: orchData });
}