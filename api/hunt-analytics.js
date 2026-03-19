export const config = { maxDuration: 30 };

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const H = { 
  'apikey': supabaseKey, 
  'Authorization': 'Bearer ' + supabaseKey, 
  'Content-Type': 'application/json', 
  'Accept': 'application/json' 
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const r = await fetch(supabaseUrl + '/rest/v1/hunt_runs?order=run_at.desc&limit=200', { headers: H });
      const data = await r.json();
      
      if (!r.ok) {
        return res.status(500).json({ error: data.message || 'Failed to fetch hunt analytics' });
      }
      
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch hunt analytics' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { 
        batch, 
        categories_processed, 
        bids_reviewed, 
        relevant_found, 
        sent_to_intake, 
        filtered_out, 
        expired_skipped, 
        duplicates_skipped, 
        secret 
      } = req.body || {};

      if (secret !== 'hgi-intake-2026-secure') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const statsObject = {
        batch,
        categories_processed,
        bids_reviewed,
        relevant_found,
        sent_to_intake,
        filtered_out,
        expired_skipped,
        duplicates_skipped
      };

      const insertData = {
        source: 'apify_central_bidding',
        status: 'completed',
        run_at: new Date().toISOString(),
        opportunities_found: sent_to_intake,
        notes: JSON.stringify(statsObject)
      };

      const r = await fetch(supabaseUrl + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify(insertData)
      });

      if (!r.ok) {
        const error = await r.json();
        return res.status(500).json({ error: error.message || 'Failed to create hunt analytics record' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to create hunt analytics record' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}