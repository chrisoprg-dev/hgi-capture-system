export const config = { maxDuration: 30 };

const FEMA_API_URL = 'https://www.fema.gov/api/open/v1/grants?$orderby=announcementDate%20desc&$top=10';
const HUD_API_URL = 'https://api.hud.gov/grants';
const SAMGOV_API_URL = 'https://api.sam.gov/opportunities/v2/search';

const HGI_VERTICALS = ['disaster', 'workforce', 'housing', 'tpa', 'recovery', 'mitigation', 'preparedness', 'employment', 'insurance'];
const HGI_GEOGRAPHY = ['LA', 'TX', 'FL', 'MS', 'AL', 'GA', 'louisiana', 'texas', 'florida', 'mississippi', 'alabama', 'georgia'];

function assessRelevance(title, description, location) {
  const text = `${title} ${description} ${location}`.toLowerCase();
  
  const hasVertical = HGI_VERTICALS.some(vertical => text.includes(vertical));
  const hasGeography = HGI_GEOGRAPHY.some(geo => text.includes(geo.toLowerCase()));
  
  let relevanceScore = 0;
  if (hasVertical) relevanceScore += 50;
  if (hasGeography) relevanceScore += 50;
  
  return {
    relevant: relevanceScore > 0,
    score: relevanceScore,
    verticals: HGI_VERTICALS.filter(v => text.includes(v)),
    geography: HGI_GEOGRAPHY.filter(g => text.includes(g.toLowerCase()))
  };
}

function estimateTimeline(announcementDate, type) {
  if (!announcementDate) return 'Unknown';
  
  const announced = new Date(announcementDate);
  const now = new Date();
  const daysSinceAnnouncement = Math.floor((now - announced) / (1000 * 60 * 60 * 24));
  
  if (type === 'presolicitation') {
    return '15-45 days';
  } else if (type === 'grant') {
    if (daysSinceAnnouncement < 30) {
      return '30-90 days';
    } else if (daysSinceAnnouncement < 90) {
      return '60-180 days';
    } else {
      return '90+ days';
    }
  }
  
  return 'Unknown';
}

async function fetchFEMAGrants() {
  try {
    const response = await fetch(FEMA_API_URL, { 
      signal: AbortSignal.timeout(10000) 
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.value) {
        return data.value.map(grant => ({
          title: grant.title || 'FEMA Grant',
          source: 'FEMA',
          amount: grant.amount || 'Not specified',
          geography: grant.location || 'National',
          timeline: estimateTimeline(grant.announcementDate, 'grant'),
          hgi_relevance: assessRelevance(grant.title || '', grant.description || '', grant.location || ''),
          raw_data: grant
        }));
      }
    }
    return [];
  } catch (error) {
    console.error('FEMA API error:', error.message);
    return [];
  }
}

async function fetchHUDGrants() {
  try {
    const response = await fetch(HUD_API_URL, { 
      signal: AbortSignal.timeout(10000) 
    });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data)) {
        return data.slice(0, 10).map(grant => ({
          title: grant.title || grant.name || 'HUD Grant',
          source: 'HUD',
          amount: grant.amount || grant.funding || 'Not specified',
          geography: grant.location || grant.state || 'National',
          timeline: estimateTimeline(grant.date || grant.announcementDate, 'grant'),
          hgi_relevance: assessRelevance(grant.title || grant.name || '', grant.description || '', grant.location || grant.state || ''),
          raw_data: grant
        }));
      }
    }
    return [];
  } catch (error) {
    console.error('HUD API error:', error.message);
    return [];
  }
}

async function fetchSAMPresolicitations() {
  try {
    const apiKey = process.env.SAMGOV_API_KEY;
    if (!apiKey) {
      console.warn('SAM.gov API key not found');
      return [];
    }

    const params = new URLSearchParams({
      limit: '10',
      postedFrom: 'LAST30DAYS',
      ptype: 'p',
      keyword: 'disaster recovery'
    });

    const response = await fetch(`${SAMGOV_API_URL}?${params}`, {
      headers: {
        'X-API-Key': apiKey
      },
      signal: AbortSignal.timeout(15000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.opportunitiesData) {
        return data.opportunitiesData.map(opp => ({
          title: opp.title || 'SAM.gov Presolicitation',
          source: 'SAM.gov',
          amount: opp.estimatedValue || 'Not specified',
          geography: opp.placeOfPerformance || opp.officeAddress?.state || 'Not specified',
          timeline: estimateTimeline(opp.postedDate, 'presolicitation'),
          hgi_relevance: assessRelevance(
            opp.title || '', 
            opp.description || '', 
            `${opp.placeOfPerformance || ''} ${opp.officeAddress?.state || ''}`
          ),
          raw_data: opp
        }));
      }
    }
    return [];
  } catch (error) {
    console.error('SAM.gov API error:', error.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [femaGrants, hudGrants, samPresolicitations] = await Promise.allSettled([
      fetchFEMAGrants(),
      fetchHUDGrants(),
      fetchSAMPresolicitations()
    ]);

    let allSignals = [];

    if (femaGrants.status === 'fulfilled') {
      allSignals = allSignals.concat(femaGrants.value);
    }

    if (hudGrants.status === 'fulfilled') {
      allSignals = allSignals.concat(hudGrants.value);
    }

    if (samPresolicitations.status === 'fulfilled') {
      allSignals = allSignals.concat(samPresolicitations.value);
    }

    // Sort by relevance score and then by recency
    allSignals.sort((a, b) => {
      if (b.hgi_relevance.score !== a.hgi_relevance.score) {
        return b.hgi_relevance.score - a.hgi_relevance.score;
      }
      return new Date(b.raw_data?.announcementDate || b.raw_data?.postedDate || 0) - 
             new Date(a.raw_data?.announcementDate || a.raw_data?.postedDate || 0);
    });

    // Clean up response - remove raw_data for cleaner output
    const cleanSignals = allSignals.map(signal => ({
      title: signal.title,
      source: signal.source,
      amount: signal.amount,
      geography: signal.geography,
      timeline: signal.timeline,
      hgi_relevance: {
        relevant: signal.hgi_relevance.relevant,
        score: signal.hgi_relevance.score,
        verticals: signal.hgi_relevance.verticals,
        geography: signal.hgi_relevance.geography
      }
    }));

    res.status(200).json({
      success: true,
      count: cleanSignals.length,
      signals: cleanSignals,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Budget signals API error:', error);
    res.status(200).json({
      success: true,
      count: 0,
      signals: [],
      timestamp: new Date().toISOString(),
      note: 'Service temporarily unavailable, returning empty results'
    });
  }
}