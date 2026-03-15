export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0];
    
    const response = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: {
          time_period: [{ start_date: today, end_date: nextYear }],
          award_type_codes: ['A','B','C','D'],
          naics_codes: ['541611','541690','561110','561990','524291','923120','921190'],
          place_of_performance_locations: [{ country: 'USA', state: 'LA' },{ country: 'USA', state: 'TX' },{ country: 'USA', state: 'FL' }]
        },
        fields: ['Award ID','Recipient Name','Award Amount','Period of Performance End Date','Awarding Agency','Description'],
        limit: 25,
        sort: 'Period of Performance End Date',
        order: 'asc'
      })
    });
    
    if (!response.ok) return res.status(200).json([]);
    
    const data = await response.json();
    const results = (data.results || []).map(c => {
      const end = new Date(c['Period of Performance End Date']);
      const days = Math.ceil((end - new Date()) / (1000*60*60*24));
      return {
        awardId: c['Award ID'],
        recipientName: c['Recipient Name'],
        awardAmount: c['Award Amount'],
        endDate: c['Period of Performance End Date'],
        awardingAgency: c['Awarding Agency'],
        description: c['Description'],
        daysUntilExpiration: days,
        recompeteStatus: days <= 90 ? 'RECOMPETE_IMMINENT' : days <= 180 ? 'RECOMPETE_SOON' : 'RECOMPETE_PIPELINE'
      };
    }).filter(c => c.daysUntilExpiration > 0 && c.daysUntilExpiration <= 365);
    
    return res.status(200).json(results);
  } catch(e) {
    return res.status(200).json([]);
  }
}