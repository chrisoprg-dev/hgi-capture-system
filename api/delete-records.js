export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { table, ids } = req.body;

  if (!table || !ids || !Array.isArray(ids)) {
    return res.status(400).json({ 
      error: 'Missing or invalid required fields: table (string) and ids (array)' 
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ 
      error: 'Missing Supabase configuration' 
    });
  }

  let deletedCount = 0;
  const errors = [];
  const total = ids.length;

  for (const id of ids) {
    try {
      const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`;
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        deletedCount++;
      } else {
        const errorText = await response.text();
        errors.push({
          id,
          status: response.status,
          message: errorText || 'Delete failed'
        });
      }
    } catch (error) {
      errors.push({
        id,
        message: error.message
      });
    }
  }

  return res.status(200).json({
    deleted: deletedCount,
    total,
    errors
  });
}