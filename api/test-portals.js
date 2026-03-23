// api/test-portals.js — One-shot portal reachability test. DELETE after use.
// Tests which state procurement portals are reachable via Vercel HTTP.
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = {};
  var tests = [
    { name: 'texas_esbd_api', url: 'https://www.esbd.texas.gov/bid-contract-search', method: 'GET' },
    { name: 'texas_esbd_json', url: 'https://www.esbd.texas.gov/api/search', method: 'GET' },
    { name: 'florida_bids', url: 'https://vendor.myfloridamarketplace.com/VendorBid/Home', method: 'GET' },
    { name: 'mississippi_purchasing', url: 'https://www.dfa.ms.gov/procurement', method: 'GET' },
    { name: 'alabama_purchasing', url: 'https://purchasing.alabama.gov', method: 'GET' },
    { name: 'georgia_doas', url: 'https://doas.ga.gov/state-purchasing/procurement-registry', method: 'GET' },
    { name: 'georgia_team_works', url: 'https://ssl.doas.state.ga.us/gpr/', method: 'GET' },
    { name: 'bidnet_direct', url: 'https://www.bidnetdirect.com/rfp-list', method: 'GET' },
    { name: 'bonfire_portal', url: 'https://bonfireportal.com', method: 'GET' },
    { name: 'demandstar', url: 'https://app.demandstar.com/api/opportunities', method: 'GET' },
    { name: 'ionwave_louisiana', url: 'https://www.ionwave.net/CurrentSolicitationsAndAwards.aspx', method: 'GET' }
  ];
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      var r = await fetch(t.url, {
        method: t.method,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/json' },
        signal: AbortSignal.timeout(5000)
      });
      var body = await r.text();
      results[t.name] = {
        status: r.status,
        reachable: r.status < 500,
        content_type: r.headers.get('content-type') || '',
        body_preview: body.slice(0, 150).replace(/\s+/g, ' ').trim(),
        has_json: (r.headers.get('content-type') || '').includes('json')
      };
    } catch(e) {
      results[t.name] = { reachable: false, error: e.message.slice(0, 100) };
    }
  }
  return res.status(200).json(results);
}