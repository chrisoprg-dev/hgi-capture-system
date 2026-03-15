const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('hunt_runs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(50);

      if (error) {
        return res.status(500).json({ error: error.message });
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
      } = req.body;

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

      const { data, error } = await supabase
        .from('hunt_runs')
        .insert([insertData]);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to create hunt analytics record' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};