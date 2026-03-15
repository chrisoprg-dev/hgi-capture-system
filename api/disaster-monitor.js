```javascript
const supabase = require('../lib/supabase');

// In-memory cache for FEMA data
let femaCache = {
  data: [],
  lastUpdated: null
};

// Calculate days since declaration
function calculateDaysSince(declarationDate) {
  const declaration = new Date(declarationDate);
  const today = new Date();
  const diffTime = Math.abs(today - declaration);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Assess opportunity window
function assessOpportunity(daysSince) {
  if (daysSince < 30) {
    return "IMMEDIATE - RFPs likely within 60 days";
  } else if (daysSince >= 30 && daysSince <= 90) {
    return "ACTIVE - Monitor for solicitations";
  } else {
    return "PIPELINE - Recovery contracts may be open";
  }
}

// Check if disaster exists in Supabase
async function checkExistingDisaster(disasterNumber, declarationTitle) {
  try {
    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .or(`title.ilike.%${declarationTitle}%,description.ilike.%${disasterNumber}%,title.ilike.%${disasterNumber}%`);
    
    if (error) {
      console.error('Error checking existing disaster:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking existing disaster:', error);
    return false;
  }
}

// Fetch FEMA disaster declarations
async function fetchFEMADeclarations() {
  try {
    const femaUrl = "https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=10&$filter=stateCode%20in%20('LA','TX','FL','MS','AL','GA')";
    
    const response = await fetch(femaUrl);
    if (!response.ok) {
      throw new Error(`FEMA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Update cache
    femaCache.data = data.DisasterDeclarationsSummaries || [];
    femaCache.lastUpdated = new Date();
    
    return femaCache.data;
  } catch (error) {
    console.error('FEMA API fetch error:', error);
    // Return cached data if available
    if (femaCache.data.length > 0) {
      return femaCache.data;
    }
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const declarations = await fetchFEMADeclarations();
      
      const processedDeclarations = await Promise.all(
        declarations.map(async (declaration) => {
          const daysSince = calculateDaysSince(declaration.declarationDate);
          const opportunityWindow = assessOpportunity(daysSince);
          const existsInDB = await checkExistingDisaster(
            declaration.disasterNumber?.toString(),
            declaration.declarationTitle
          );
          
          return {
            declarationTitle: declaration.declarationTitle,
            state: declaration.stateCode,
            declarationDate: declaration.declarationDate,
            incidentType: declaration.incidentType,
            disasterNumber: declaration.disasterNumber,
            daysSince,
            opportunityWindow,
            existsInDatabase: existsInDB,
            designatedArea: declaration.designatedArea,
            ihProgramDeclared: declaration.ihProgramDeclared,
            iaProgramDeclared: declaration.iaProgramDeclared,
            paProgramDeclared: declaration.paProgramDeclared,
            hmProgramDeclared: declaration.hmProgramDeclared
          };
        })
      );
      
      return res.status(200).json({
        success: true,
        declarations: processedDeclarations,
        cacheInfo: {
          lastUpdated: femaCache.lastUpdated,
          fromCache: false
        }
      });
    } catch (error) {
      console.error('Error fetching FEMA declarations:', error);
      
      // Return cached data with error message
      if (femaCache.data.length > 0) {
        const processedDeclarations = await Promise.all(
          femaCache.data.map(async (declaration) => {
            const daysSince = calculateDaysSince(declaration.declarationDate);
            const opportunityWindow = assessOpportunity(daysSince);
            const existsInDB = await checkExistingDisaster(
              declaration.disasterNumber?.toString(),
              declaration.declarationTitle
            );
            
            return {
              declarationTitle: declaration.declarationTitle,
              state: declaration.stateCode,
              declarationDate: declaration.declarationDate,
              incidentType: declaration.incidentType,
              disasterNumber: declaration.disasterNumber,
              daysSince,
              opportunityWindow,
              existsInDatabase: existsInDB
            };
          })
        );
        
        return res.status(200).json({
          success: true,
          declarations: processedDeclarations,
          error: 'FEMA API unavailable, returning cached data',
          cacheInfo: {
            lastUpdated: femaCache.lastUpdated,
            fromCache: true
          }
        });
      }
      
      return res.status(500).json({
        success: false,
        declarations: [],
        error: 'FEMA API unavailable and no cached data available'
      });
    }
  }
  
  if (req.method === 'POST') {
    try {
      const { disasterNumber, declarationTitle, state, declarationDate } = req.body;
      
      if (!disasterNumber || !declarationTitle || !state || !declarationDate) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: disasterNumber, declarationTitle, state, declarationDate'
        });
      }
      
      // Insert into hunt_runs table
      const { data, error } = await supabase
        .from('hunt_runs')
        .insert({
          source: 'fema_declaration',
          query_params: {
            disasterNumber,
            declarationTitle,
            state,
            declarationDate
          },
          results_count: 1,
          status: 'completed',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error inserting disaster alert:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to save disaster alert'
        });
      }
      
      const daysSince = calculateDaysSince(declarationDate);
      const opportunityWindow = assessOpportunity(daysSince);
      
      return res.status(201).json({
        success: true,
        message: 'Disaster alert added successfully',
        alert: {
          id: data.id,
          disasterNumber,
          declarationTitle,
          state,
          declarationDate,
          daysSince,
          opportunityWindow,
          source: 'fema_declaration'
        }
      });
    } catch (error) {
      console.error('Error adding disaster alert:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
}
```