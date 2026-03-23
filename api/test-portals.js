// api/test-portals.js — Phase 2: test reachable portals with proper headers
export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = {};
  var hdrs = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5' };
  var tests = [
    { name: 'bidnet_api_search', url: 'https://www.bidnetdirect.com/vendor/opportunities/search?keyword=claims+administration&stateCode=LA', method: 'GET' },
    { name: 'bidnet_api_tpa', url: 'https://www.bidnetdirect.com/vendor/opportunities/search?keyword=third+party+administrator&stateCode=LA,TX,FL,MS', method: 'GET' },
    { name: 'demandstar_api', url: 'https://app.demandstar.com/api/opportunities?keyword=claims+administration&pageSize=10', method: 'GET' },
    { name: 'georgia_gpr_search', url: 'https://ssl.doas.state.ga.us/gpr/index.cfm?action=awardITBList', method: 'GET' },
    { name: 'georgia_gpr_rfp', url: 'https://ssl.doas.state.ga.us/gpr/index.cfm?action=searchRFP&keyword=program+management', method: 'GET' },
    { name: 'florida_myflorida_api', url: 'https://vendor.myfloridamarketplace.com/VendorBid/public/bids/search?keyword=claims+administration&status=open', method: 'GET' },
    { name: 'ionwave_la', url: 'https://www.ionwave.net/CurrentSolicitationsAndAwards.aspx', method: 'GET' },
    { name: 'purchasing_la_eproc', url: 'https://wwwcfprd.doa.louisiana.gov/OSP/LaPAC/advsearch.cfm', method: 'GET' },
    { name: 'alabama_ib_search', url: 'https://purchasing.alabama.gov/ibs/ibs_search_result.cfm?stype=ALL&category=&keywords=program+management&agency=', method: 'GET' }
  ];
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      var r = await fetch(t.url, { method: t.method, headers: hdrs, signal: AbortSignal.timeout(6000) });
      var body = await r.text();
      results[t.name] = {
        status: r.status,
        reachable: r.status < 500 && r.status !== 403,
        content_type: r.headers.get('content-type') || '',
        body_length: body.length,
        body_preview: body.slice(0, 200).replace(/\s+/g, ' ').trim(),
        has_json: (r.headers.get('content-type') || '').includes('json'),
        looks_useful: body.length > 500 && !body.includes('Access Denied') && !body.includes('403 Forbidden') && !body.includes('Login Required')
      };
    } catch(e) {
      results[t.name] = { reachable: false, error: e.message.slice(0, 100) };
    }
  }
  return res.status(200).json(results);
}