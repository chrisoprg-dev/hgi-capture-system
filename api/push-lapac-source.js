export const config = { maxDuration: 60 };
const ACTOR_ID = 'hVmvojDyPeJ799Suf';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const token = process.env.APIFY_API_TOKEN;

  // Fetch the current main.js from GitHub
  const ghRes = await fetch('https://raw.githubusercontent.com/chrisoprg-dev/hgi-capture-system/main/apify/lapac/src/main.js');
  if (!ghRes.ok) return res.status(502).json({ error: 'GitHub fetch failed', status: ghRes.status });
  const sourceCode = await ghRes.text();

  // PUT the source file directly into Apify actor version 0
  const putRes = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/versions/0?token=' + token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      versionNumber: '0.0',
      sourceType: 'SOURCE_FILES',
      sourceFiles: [
        { name: 'package.json', format: 'TEXT', content: '{"name":"hgi-lapac-scraper","version":"1.0.1","type":"module","main":"src/main.js","scripts":{"start":"node src/main.js"},"dependencies":{"apify":"^3.0.0","crawlee":"^3.0.0","playwright":"^1.40.0"}}' },
        { name: 'src/main.js', format: 'TEXT', content: sourceCode }
      ]
    })
  });
  const putData = await putRes.json();

  if (!putRes.ok) return res.status(502).json({ error: 'Apify PUT failed', status: putRes.status, detail: putData });

  // Trigger a new build
  const buildRes = await fetch('https://api.apify.com/v2/acts/' + ACTOR_ID + '/builds?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'latest', version: '0.0' })
  });
  const buildData = await buildRes.json();

  return res.json({
    sourceUpdated: putRes.ok,
    buildTriggered: buildRes.ok,
    buildId: buildData.data?.id,
    buildStatus: buildData.data?.status,
    sourceLength: sourceCode.length,
    ts: Date.now()
  });
}