export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiUrl = 'https://www.federalregister.gov/api/v1/articles.json?fields[]=title&fields[]=abstract&fields[]=publication_date&fields[]=agency_names&fields[]=document_number&fields[]=html_url&per_page=20&order=newest&conditions[term]=FEMA+disaster+recovery+OR+CDBG-DR+OR+public+assistance+OR+hazard+mitigation';
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      return res.status(200).json([]);
    }

    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      return res.status(200).json([]);
    }

    const hgiKeywords = [
      'fema', 'hud', 'treasury', 'cdbg', 'disaster recovery', 'public assistance', 
      'workforce', 'housing', 'hazard mitigation', 'emergency management'
    ];

    const highImpactKeywords = [
      'cdbg-dr', 'public assistance', 'fema pa', 'disaster recovery funding',
      'workforce development', 'housing rehabilitation'
    ];

    const mediumImpactKeywords = [
      'hazard mitigation', 'community development', 'emergency management',
      'disaster preparedness', 'recovery planning'
    ];

    const filteredResults = data.results
      .filter(article => {
        const searchText = `${article.title || ''} ${article.abstract || ''} ${(article.agency_names || []).join(' ')}`.toLowerCase();
        return hgiKeywords.some(keyword => searchText.includes(keyword));
      })
      .map(article => {
        const searchText = `${article.title || ''} ${article.abstract || ''}`.toLowerCase();
        const publicationDate = new Date(article.publication_date);
        const today = new Date();
        const daysAgo = Math.floor((today - publicationDate) / (1000 * 60 * 60 * 24));

        let hgiImpact = 'LOW';
        let actionRequired = 'Monitor for potential impacts on HGI operations';

        if (highImpactKeywords.some(keyword => searchText.includes(keyword))) {
          hgiImpact = 'HIGH';
          if (searchText.includes('cdbg-dr')) {
            actionRequired = 'Review new CDBG-DR compliance requirements and update proposal language';
          } else if (searchText.includes('public assistance') || searchText.includes('fema pa')) {
            actionRequired = 'Review new FEMA PA eligibility rules and update program procedures';
          } else if (searchText.includes('workforce development')) {
            actionRequired = 'Assess impact on workforce training programs and update strategies';
          } else if (searchText.includes('housing rehabilitation')) {
            actionRequired = 'Review housing program requirements and update implementation plans';
          } else {
            actionRequired = 'Immediate review required - high impact on HGI disaster recovery operations';
          }
        } else if (mediumImpactKeywords.some(keyword => searchText.includes(keyword))) {
          hgiImpact = 'MEDIUM';
          if (searchText.includes('hazard mitigation')) {
            actionRequired = 'Review hazard mitigation guidance for potential program integration opportunities';
          } else if (searchText.includes('community development')) {
            actionRequired = 'Evaluate community development rule changes for program alignment';
          } else {
            actionRequired = 'Review regulatory changes and assess need for program adjustments';
          }
        }

        return {
          title: article.title,
          abstract: article.abstract,
          publication_date: article.publication_date,
          agency_names: article.agency_names,
          document_number: article.document_number,
          html_url: article.html_url,
          days_ago: daysAgo,
          hgi_impact: hgiImpact,
          action_required: actionRequired
        };
      })
      .sort((a, b) => {
        const impactOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        if (impactOrder[a.hgi_impact] !== impactOrder[b.hgi_impact]) {
          return impactOrder[b.hgi_impact] - impactOrder[a.hgi_impact];
        }
        return a.days_ago - b.days_ago;
      });

    res.status(200).json(filteredResults);
  } catch (error) {
    res.status(200).json([]);
  }
}