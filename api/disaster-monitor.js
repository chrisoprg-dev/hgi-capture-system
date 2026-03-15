```javascript
export const config = { maxDuration: 30 };

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
    return "IMMEDIATE";
  } else if (daysSince >= 30 && daysSince <= 90) {
    return "ACTIVE";
  } else {
    return "PIPELINE";
  }
}

// Fetch FEMA disaster declarations
async function fetchFEMADeclarations() {
  try {
    const femaUrl = "https://www.fema.gov/api/open/v2/disasterDeclarationsSummaries?$orderby=declarationDate%20desc&$top=20&$filter=stateCode%20in%20('LA','TX','FL','MS','AL','GA')";
    
    const response = await fetch(femaUrl);
    if (!response.ok) {
      throw new Error(`FEMA API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.DisasterDeclarationsSummaries || [];
  } catch (error) {
    console.error('FEMA API fetch error:', error);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const declarations = await fetchFEMADeclarations();
      
      const processedDeclarations = declarations.map(declaration => {
        const daysSince = calculateDaysSince(declaration.declarationDate);
        const opportunityWindow = assessOpportunity(daysSince);
        
        return {
          declarationTitle: declaration.declarationTitle,
          state: declaration.stateCode,
          declarationDate: declaration.declarationDate,
          incidentType: declaration.incidentType,
          disasterNumber: declaration.disasterNumber,
          daysSince,
          opportunityWindow,
          designatedArea: declaration.designatedArea,
          ihProgramDeclared: declaration.ihProgramDeclared,
          iaProgramDeclared: declaration.iaProgramDeclared,
          paProgramDeclared: declaration.paProgramDeclared,
          hmProgramDeclared: declaration.hmProgramDeclared
        };
      });
      
      return res.status(200).json(processedDeclarations);
    } catch (error) {
      console.error('Error fetching FEMA declarations:', error);
      return res.status(200).json([]);
    }
  }
  
  if (req.method === 'POST') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_KEY;
      
      if (!supabaseUrl || !serviceKey) {
        console.error('Missing Supabase environment variables');
        return res.status(500).json({ success: false, error: 'Configuration error' });
      }
      
      // Insert into hunt_runs table
      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/hunt_runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          source: 'fema_declaration',
          opportunities_found: 1,
          status: 'completed',
          run_at: new Date().toISOString()
        })
      });
      
      if (!insertResponse.ok) {
        console.error('Error inserting hunt run:', insertResponse.status, insertResponse.statusText);
        return res.status(500).json({ success: false, error: 'Failed to save hunt run' });
      }
      
      return res.status(201).json({
        success: true,
        message: 'Hunt run recorded successfully'
      });
    } catch (error) {
      console.error('Error recording hunt run:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
  
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
```