export const config = { maxDuration: 30 };

const HGI_STATES = ['LA', 'TX', 'FL', 'MS', 'AL', 'GA'];

function daysSince(declarationDate) {
  return Math.ceil((Date.now() - new Date(declarationDate)) / (1000 * 60 * 60 * 24));
}

function opportunityWindow(days) {
  if (days < 30)  return 'IMMEDIATE';
  if (days < 90)  return 'ACTIVE';
  return 'PIPELINE';
}

function hgiImplication(decl) {
  const parts = [];
  if (decl.paProgramDeclared) parts.push('FEMA PA Categories A-G — HGI core competency');
  if (decl.hmProgramDeclared) parts.push('Hazard Mitigation 404/406 grants — HGI core competency');
  if (decl.iaProgramDeclared) parts.push('Individual Assistance programs — potential CDBG-DR wave to follow');
  if (decl.ihProgramDeclared) parts.push('IH Program declared');
  return parts.length > 0 ? parts.join('; ') : 'Monitor for solicitations';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      // Hardcoded fully-encoded FEMA URL — avoids template literal encoding issues on Vercel
      const url = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=state%20eq%20'LA'%20or%20state%20eq%20'TX'%20or%20state%20eq%20'FL'%20or%20state%20eq%20'MS'%20or%20state%20eq%20'AL'%20or%20state%20eq%20'GA'&$orderby=declarationDate%20desc&$top=50&$select=declarationTitle,state,declarationDate,incidentType,disasterNumber,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,hmProgramDeclared";

      const femaRes = await fetch(url);
      if (!femaRes.ok) throw new Error(`FEMA API ${femaRes.status}`);

      const data = await femaRes.json();
      const raw = data.DisasterDeclarationsSummaries || [];

      // Deduplicate by disasterNumber — FEMA returns one row per designated area
      const seen = new Set();
      const declarations = [];
      for (const d of raw) {
        if (seen.has(d.disasterNumber)) continue;
        seen.add(d.disasterNumber);
        const days = daysSince(d.declarationDate);
        declarations.push({
          title: d.declarationTitle,
          event: d.declarationTitle,
          state: d.state,
          declarationDate: d.declarationDate,
          incidentType: d.incidentType,
          disasterNumber: d.disasterNumber,
          daysSince: days,
          opportunityWindow: opportunityWindow(days),
          urgency: opportunityWindow(days),
          paProgramDeclared: d.paProgramDeclared,
          hmProgramDeclared: d.hmProgramDeclared,
          iaProgramDeclared: d.iaProgramDeclared,
          ihProgramDeclared: d.ihProgramDeclared,
          implication: hgiImplication(d),
          timing: opportunityWindow(days) === 'IMMEDIATE'
            ? 'RFPs likely within 30-60 days — position now'
            : opportunityWindow(days) === 'ACTIVE'
            ? 'Monitor procurement portals weekly'
            : 'Watch for recompetes and supplemental awards'
        });
      }

      return res.status(200).json(declarations);
    } catch (err) {
      console.error('disaster-monitor error:', err.message);
      return res.status(200).json([]);
    }
  }

  if (req.method === 'POST') {
    // Manual disaster tracking — log to hunt_runs
    try {
      const SB = process.env.SUPABASE_URL;
      const KEY = process.env.SUPABASE_SERVICE_KEY;
      if (!SB || !KEY) return res.status(500).json({ error: 'Missing env vars' });

      await fetch(`${SB}/rest/v1/hunt_runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KEY}`,
          'apikey': KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          source: 'fema_declaration_manual',
          opportunities_found: 1,
          status: 'completed',
          run_at: new Date().toISOString()
        })
      });
      return res.status(201).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
