// RETIRED — portal reachability tests complete Session 31
// Findings: AL/GA/FL reachable via HTTP. TX/MS/BidNet blocked — need Apify actors.
export default async function handler(req, res) {
  return res.status(410).json({ message: 'Retired. Portal reachability test complete Session 31.' });
}