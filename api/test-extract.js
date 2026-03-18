export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pdfId = req.query.pdf || '8963200';
  const pdfUrl = 'https://wwwcfprd.doa.louisiana.gov/osp/lapac/agency/pdf/' + pdfId + '.pdf';

  let pdfStatus = 0, pdfBytes = 0, base64 = '';
  try {
    const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    pdfStatus = pdfRes.status;
    if (pdfRes.ok) {
      const buf = await pdfRes.arrayBuffer();
      pdfBytes = buf.byteLength;
      const truncated = buf.slice(0, 150000); // First 150KB — fits in 200K token limit; RFP title/agency/deadline in first pages
      base64 = Buffer.from(truncated).toString('base64');
    } else {
      return res.json({ pdfStatus, pdfBytes: 0, extractStatus: 'skipped', extractBody: 'PDF fetch failed' });
    }
  } catch(e) {
    return res.json({ pdfStatus: 'error', pdfBytes: 0, extractStatus: 'skipped', extractBody: e.message });
  }

  let extractStatus = 0, extractBody = '';
  try {
    const extractRes = await fetch('https://hgi-capture-system.vercel.app/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, url: pdfUrl })
    });
    extractStatus = extractRes.status;
    extractBody = await extractRes.text();
  } catch(e) {
    extractStatus = 'error';
    extractBody = e.message;
  }

  return res.json({ pdfStatus, pdfBytes, base64Length: base64.length, extractStatus, extractBody: extractBody.substring(0, 1000) });
}