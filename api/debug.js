export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SAM_KEY = process.env.SAM_GOV_API_KEY;

  // Test SAM.gov connectivity
  let samTest = "not tested";
  let samStatus = 0;
  let samBody = "";
  try {
    const r = await fetch(`https://api.sam.gov/prod/opportunities/v2/search?api_key=${SAM_KEY}&limit=2&postedFrom=01/01/2026&postedTo=03/02/2026`, {
      headers: { "Accept": "application/json" }
    });
    samStatus = r.status;
    samBody = await r.text();
    samTest = samBody.slice(0,300);
  } catch(e) { samTest = "FETCH ERROR: " + e.message; }

  // Test Supabase connectivity
  let supaTest = "not tested";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/opportunities?limit=1`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    supaTest = r.ok ? `OK - status ${r.status}` : `ERROR - status ${r.status}: ${await r.text()}`;
  } catch(e) { supaTest = "FETCH ERROR: " + e.message; }

  // Test LaPAC
  let lapacTest = "not tested";
  try {
    const r = await fetch("https://lapac.doa.louisiana.gov/vendor/bidding/current-solicitations/", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    lapacTest = `status ${r.status} - content-type: ${r.headers.get("content-type")}`;
  } catch(e) { lapacTest = "FETCH ERROR: " + e.message; }

  return res.status(200).json({
    env: {
      SUPABASE_URL: SUPABASE_URL ? "SET" : "MISSING",
      SUPABASE_SERVICE_KEY: SUPABASE_KEY ? "SET" : "MISSING",
      SAM_GOV_API_KEY: SAM_KEY ? "SET" : "MISSING",
    },
    samTest: { status: samStatus, response: samTest },
    supabaseTest: supaTest,
    lapacTest,
  });
}