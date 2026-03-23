export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = {};
  // Correct endpoint: CamelCase, OData $filter syntax
  var cutoff = new Date(Date.now() - 60 * 24 * 3600000).toISOString().slice(0,10);
  var url = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationType%20eq%20%27DR%27%20and%20(state%20eq%20%27LA%27%20or%20state%20eq%20%27TX%27%20or%20state%20eq%20%27FL%27%20or%20state%20eq%20%27MS%27)%20and%20declarationDate%20gt%20%27' + cutoff + '%27&$orderby=declarationDate%20desc&$top=5';
  try {
    var r = await fetch(url);
    results.status = r.status;
    results.url_used = url;
    if (r.ok) {
      var d = await r.json();
      results.top_keys = Object.keys(d);
      var recs = d.DisasterDeclarationsSummaries || [];
      results.count = recs.length;
      results.sample = recs.slice(0,2).map(function(r) { return { disasterNumber: r.disasterNumber, state: r.state, declarationTitle: r.declarationTitle, declarationDate: r.declarationDate, declarationType: r.declarationType }; });
    } else {
      var t = await r.text();
      results.error_body = t.slice(0,300);
    }
  } catch(e) { results.error = e.message; }
  results.timestamp = new Date().toISOString();
  return res.status(200).json(results);
}