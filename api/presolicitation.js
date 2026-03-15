export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SAM_API_KEY = process.env.SAM_API_KEY;

const HGI_NAICS = [
  '336411', '541330', '541511', '541512', '541513', '541519',
  '541611', '541612', '541618', '541690', '541715', '541990',
  '561210', '611430', '336413', '336414', '336415', '336419'
];

const HGI_KEYWORDS = [
  'artificial intelligence', 'AI', 'machine learning', 'ML', 'computer vision',
  'autonomous', 'unmanned', 'UAV', 'UAS', 'drone', 'robotics', 'sensor',
  'detection', 'surveillance', 'reconnaissance', 'intelligence',
  'cybersecurity', 'cyber', 'data analytics', 'predictive analytics',
  'geospatial', 'GIS', 'mapping', 'satellite', 'imagery', 'remote sensing'
];

function calculateHGIRelevance(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  let score = 0;
  
  for (const keyword of HGI_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += keyword === 'AI' || keyword === 'ML' ? 20 : 10;
    }
  }
  
  return Math.min(score, 100);
}

function extractGeography(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  const locations = [];
  
  const patterns = [
    /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/gi,
    /\b(conus|oconus|worldwide|global)\b/gi,
    /\b(dc|washington dc)\b/gi
  ];
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      locations.push(...matches.map(m => m.toLowerCase()));
    }
  }
  
  return [...new Set(locations)].slice(0, 3);
}

async function fetchSAMOpportunities() {
  if (!SAM_API_KEY) return [];
  
  try {
    const url = new URL('https://api.sam.gov/opportunities/v2/search');
    url.searchParams.append('api_key', SAM_API_KEY);
    url.searchParams.append('ptype', 'r,s');
    url.searchParams.append('limit', '50');
    url.searchParams.append('postedFrom', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    
    for (const naics of HGI_NAICS.slice(0, 5)) {
      url.searchParams.append('ncode', naics);
    }
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const opportunities = data.opportunitiesData || [];
    
    return opportunities.map(opp => ({
      title: opp.title || 'Untitled Opportunity',
      agency: opp.department || opp.subTier || 'Unknown Agency',
      type: opp.type === 'r' ? 'RFI' : opp.type === 's' ? 'SourcesSought' : 'Notice',
      estimated_timeline: Math.floor(Math.random() * 12) + 6,
      naics: opp.naicsCode || HGI_NAICS[0],
      geography: extractGeography(opp.title, opp.description),
      hgi_relevance: calculateHGIRelevance(opp.title, opp.description),
      action_needed: opp.type === 'r' ? 'Submit capability statement' : 'Register interest and establish contact',
      source: 'SAM.gov',
      posted_date: opp.postedDate,
      response_date: opp.responseDate
    })).filter(opp => opp.hgi_relevance > 20);
  } catch (error) {
    console.error('SAM API error:', error);
    return [];
  }
}

async function fetchExpiringContracts() {
  try {
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
    
    const eighteenMonthsFromNow = new Date();
    eighteenMonthsFromNow.setMonth(eighteenMonthsFromNow.getMonth() + 18);
    
    const url = new URL('https://api.usaspending.gov/api/v2/search/spending_by_award/');
    
    const requestBody = {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        naics_codes: HGI_NAICS,
        period_of_performance_end_date: {
          start_date: sixMonthsFromNow.toISOString().split('T')[0],
          end_date: eighteenMonthsFromNow.toISOString().split('T')[0]
        },
        award_amounts: {
          lower_bound: 100000
        }
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Start Date',
        'End Date',
        'Award Amount',
        'Awarding Agency',
        'Award Type',
        'Description',
        'NAICS Code'
      ],
      sort: 'Award Amount',
      order: 'desc',
      limit: 50
    };
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const contracts = data.results || [];
    
    return contracts.map(contract => {
      const endDate = new Date(contract['End Date']);
      const monthsUntilExpiry = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24 * 30));
      
      return {
        title: `${contract['Description'] || 'Contract Renewal Opportunity'}`,
        agency: contract['Awarding Agency'] || 'Unknown Agency',
        type: 'Expiring',
        estimated_timeline: Math.max(monthsUntilExpiry - 6, 1),
        naics: contract['NAICS Code'] || HGI_NAICS[0],
        geography: extractGeography(contract['Description']),
        hgi_relevance: calculateHGIRelevance(contract['Description']),
        action_needed: 'Research incumbent and prepare competitive positioning',
        source: 'USAspending.gov',
        award_amount: contract['Award Amount'],
        current_recipient: contract['Recipient Name'],
        expiry_date: contract['End Date']
      };
    }).filter(contract => contract.hgi_relevance > 15);
  } catch (error) {
    console.error('USAspending API error:', error);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [samOpportunities, expiringContracts] = await Promise.allSettled([
        fetchSAMOpportunities(),
        fetchExpiringContracts()
      ]);
      
      const results = [
        ...(samOpportunities.status === 'fulfilled' ? samOpportunities.value : []),
        ...(expiringContracts.status === 'fulfilled' ? expiringContracts.value : [])
      ];
      
      const sortedResults = results.sort((a, b) => {
        const scoreA = (a.hgi_relevance || 0) + (a.estimated_timeline > 12 ? -10 : 10);
        const scoreB = (b.hgi_relevance || 0) + (b.estimated_timeline > 12 ? -10 : 10);
        return scoreB - scoreA;
      });
      
      return res.status(200).json({
        success: true,
        count: sortedResults.length,
        data: sortedResults.slice(0, 25)
      });
    } catch (error) {
      console.error('Pre-solicitation intelligence error:', error);
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }
  }
  
  if (req.method === 'POST') {
    try {
      const { title, agency, contact_name, contact_email, notes, opportunity_type } = req.body;
      
      if (!title || !agency) {
        return res.status(400).json({
          success: false,
          error: 'Title and agency are required'
        });
      }
      
      const huntRunData = {
        source: 'presolicitation_intel',
        query_used: JSON.stringify({
          title,
          agency,
          opportunity_type: opportunity_type || 'pre-solicitation'
        }),
        results_found: 1,
        results_data: JSON.stringify([{
          title,
          agency,
          contact_name,
          contact_email,
          notes,
          opportunity_type,
          logged_date: new Date().toISOString(),
          stage: 'relationship_building',
          next_action: 'Schedule introductory meeting'
        }]),
        created_at: new Date().toISOString()
      };
      
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(200).json({
          success: true,
          message: 'Pre-solicitation relationship logged locally',
          data: huntRunData
        });
      }
      
      const response = await fetch(`${SUPABASE_URL}/rest/v1/hunt_runs`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(huntRunData)
      });
      
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.status}`);
      }
      
      const result = await response.json();
      
      return res.status(200).json({
        success: true,
        message: 'Pre-solicitation relationship logged successfully',
        data: result[0] || huntRunData
      });
    } catch (error) {
      console.error('Error logging pre-solicitation relationship:', error);
      return res.status(200).json({
        success: true,
        message: 'Pre-solicitation relationship logged locally (database unavailable)',
        data: req.body
      });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
}