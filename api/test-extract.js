export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const pdfId = req.query.pdf || '8963200';
  const pdfUrl = 'https://wwwcfprd.doa.louisiana.gov/osp/lapac/agency/pdf/' + pdfId + '.pdf';

  // Use URL source — pass URL directly to extract-pdf, no base64 needed
  let extractStatus = 0, extractBody = '';
  try {
    const extractRes = await fetch('https://hgi-capture-system.vercel.app/api/extract-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pdfUrl })
    });
    extractStatus = extractRes.status;
    extractBody = await extractRes.text();
  } catch(e) {
    extractStatus = 'error';
    extractBody = e.message;
  }

  return res.json({ pdfUrl, extractStatus, extractBody: extractBody.substring(0, 2000) });
}