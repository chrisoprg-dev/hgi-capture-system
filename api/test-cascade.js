export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var event = req.query.event || 'opportunity.winnability_scored';
  var r = await fetch('https://hgi-capture-system.vercel.app/api/cascade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: event, opportunity_id: 'test-cascade-verification', data: { recommendation: 'GO', pwin: 75 } })
  });
  var d = await r.json();
  return res.status(200).json({ cascade_test: true, event_fired: event, response: d });
}
