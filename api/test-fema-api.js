export const config = { maxDuration: 30 };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var results = {};
  // Test 1: OData filter syntax (correct OpenFEMA v2 format)
  try {
    var r1 = await fetch('https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$filter=declarationType%20eq%20%27DR%27%20and%20state%20eq%20%27LA%27&$orderby=declarationDate%20desc&$top=3');
    results.test1_status = r1.status;
    if (r1.ok) { var d1 = await r1.json(); results.test1_keys = Object.keys(d1); results.test1_count = (d1.DisasterDeclarationsSummaries || d1.disasterDeclarationsSummaries || []).length; }
  } catch(e) { results.test1_error = e.message; }
  // Test 2: Simple filter without OData
  try {
    var r2 = await fetch('https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?declarationType=DR&state=LA&limit=3');
    results.test2_status = r2.status;
    if (r2.ok) { var d2 = await r2.json(); results.test2_keys = Object.keys(d2); results.test2_count = (d2.DisasterDeclarationsSummaries || d2.disasterDeclarationsSummaries || []).length; }
  } catch(e) { results.test2_error = e.message; }
  // Test 3: FEMA disasters page (newer API)
  try {
    var r3 = await fetch('https://www.fema.gov/api/open/v1/disasterDeclarations?declarationType=DR&stateCode=LA&limit=3');
    results.test3_status = r3.status;
    if (r3.ok) { var d3 = await r3.json(); results.test3_keys = Object.keys(d3); }
  } catch(e) { results.test3_error = e.message; }
  results.timestamp = new Date().toISOString();
  return res.status(200).json(results);
}