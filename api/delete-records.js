export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ 
      error: 'Missing Supabase configuration' 
    });
  }

  const idsToDelete = [
    'doc-1772790201895-WORD------HGI-Proposal------SWBNO------Appeal-Management-Services-------08-Decem',
    'doc-1772831317625-Restore-PA-Management-9-24-2021-email-pdf-url',
    'doc-1772831329017-Homeowners-Assistance-Program-pdf-url',
    'doc-1772833559581-DSS-Deepwater-Horizon-Oil-Spill-Claims-Analysis-Final-Submitted-pdf-url',
    'doc-1772833563376-Final-Draft---TPCIGA-2024-0102-Proposal-Response---Hammerman-and-Gainer--LLC-pdf',
    'doc-1772833566965-RFP-for-Program-Management-of-Disaster-Response-and-Recovery-Housing-Programs-FI',
    'doc-1772833569256-HGI-Response-to-RFP-2024-19-FEMA-Public-Assistance-Services---FINAL-pdf-url',
    'doc-1772833572692-HGI-GOHSEP-Technical-Proposal-4-23-25-FINAL-pdf-url',
    'doc-1772833576950-HGI-Response-to-RFP-2024-19-FEMA-Public-Assistance-Services---FINAL-pdf-url',
    'doc-1772833580803-TPG-Proposal-Final-pdf-url',
    'doc-1772833582697-WORD------HGI-Proposal------SWBNO------Appeal-Management-Services-------08-Decem',
    'doc-1772833805264-LWC-Rapid-Response-RFP--October-28--2021--docx-url'
  ];

  let deletedCount = 0;

  for (const id of idsToDelete) {
    try {
      const url = `${supabaseUrl}/rest/v1/knowledge_documents?id=eq.${encodeURIComponent(id)}`;
      
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
      }
    } catch (error) {
      // Continue with remaining deletions
    }
  }

  return res.status(200).json({
    deleted: deletedCount
  });
}