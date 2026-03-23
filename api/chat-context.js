export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    var oppId = (req.query && req.query.opp_id) ? req.query.opp_id : null;

    // Load pipeline summary + organism memory in parallel
    var fetches = [
      fetch(SB + '/rest/v1/opportunities?status=in.(active,pursuing,proposal)&opi_score=gte.50&select=id,title,agency,opi_score,due_date,stage,vertical,estimated_value&order=opi_score.desc&limit=10', { headers: H }),
      fetch(SB + '/rest/v1/organism_memory?memory_type=neq.decision_point&order=created_at.desc&limit=15&select=agent,observation,created_at', { headers: H })
    ];
    // If opp_id given, also fetch full proposal record
    if (oppId) {
      fetches.push(fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(oppId) + '&select=id,title,agency,opi_score,due_date,stage,vertical,scope_analysis,staffing_plan,research_brief,financial_analysis,capture_action&limit=1', { headers: H }));
    }
    var results = await Promise.all(fetches);
    var opps = await results[0].json();
    var mems = await results[1].json();
    var focusOpp = oppId && results[2] ? ((await results[2].json()) || [])[0] : null;

    var pipelineCtx = '';
    if (opps && opps.length) {
      pipelineCtx = '\nACTIVE PIPELINE (' + opps.length + ' opportunities):\n';
      for (var i = 0; i < opps.length; i++) {
        var o = opps[i];
        pipelineCtx += '- ' + o.title + ' | ' + (o.agency||'') + ' | OPI ' + (o.opi_score||0) + ' | Due: ' + (o.due_date||'TBD') + ' | Stage: ' + (o.stage||'identified') + ' | ' + (o.vertical||'') + '\n';
      }
    }

    var memCtx = '';
    if (mems && mems.length) {
      memCtx = '\nORGANISM INTELLIGENCE (latest findings):\n';
      for (var j = 0; j < Math.min(mems.length, 10); j++) {
        memCtx += '[' + (mems[j].agent||'') + ' ' + (mems[j].created_at||'').slice(0,10) + ']: ' + (mems[j].observation||'').slice(0,300) + '\n\n';
      }
    }

    // Proposal-focused context — injected when a specific opp is in focus
    var proposalCtx = '';
    if (focusOpp) {
      proposalCtx = '\n\n=== FOCUSED OPPORTUNITY: ' + focusOpp.title + ' | ' + focusOpp.agency + ' | OPI ' + focusOpp.opi_score + ' | Due: ' + (focusOpp.due_date||'TBD') + ' ===';
      if ((focusOpp.scope_analysis||'').length > 100) {
        proposalCtx += '\n\nRFP SCOPE & EVAL CRITERIA:\n' + (focusOpp.scope_analysis||'').slice(0, 3000);
      }
      if ((focusOpp.staffing_plan||'').length > 100) {
        proposalCtx += '\n\nCURRENT PROPOSAL DRAFT (first 8000 chars):\n' + (focusOpp.staffing_plan||'').slice(0, 8000);
      }
      if ((focusOpp.research_brief||'').length > 100) {
        proposalCtx += '\n\nCOMPETITIVE RESEARCH:\n' + (focusOpp.research_brief||'').slice(0, 1500);
      }
      if ((focusOpp.financial_analysis||'').length > 100) {
        proposalCtx += '\n\nFINANCIAL ANALYSIS:\n' + (focusOpp.financial_analysis||'').slice(0, 1000);
      }
    }

    var d = String.fromCharCode(36);
    var sys = 'You are the HGI AI Capture System — a living organism that finds government opportunities and produces winning proposals. You speak directly to Christopher Oney (President), Lou Resweber (CEO), Candy Dottolo (CAO), and Dillon Truax (VP Proposals).\n\nHGI FACTS: Hammerman & Gainer LLC, founded 1929, 96 years, 100% minority-owned. 67 FT + 43 contract professionals. HQ Kenner LA, offices Shreveport, Alexandria, New Orleans. SAM UEI: DL4SJEVKZ6H4.\n\n8 VERTICALS: Disaster Recovery, TPA/Claims (WC, P&C, guaranty), Property Tax Appeals, Workforce/WIOA, Construction Management, Program Administration, Housing/HUD, Grant Management. NOT Medicaid, NOT health.\n\nCONFIRMED PAST PERFORMANCE: Road Home ' + d + '67M/' + d + '13B+ zero misappropriation, Restore LA ' + d + '42.3M, TPSD ' + d + '2.96M (completed 2022-2025), HAP ' + d + '950M, St John Sheriff ' + d + '788K, Rebuild NJ ' + d + '67.7M, BP GCCF ' + d + '1.65M, City of NOLA WC TPA ' + d + '283K/mo active, SWBNO ' + d + '200K/mo active.\n\nCONFIRMED REFERENCES (never question these): Paul Rainwater rainwater97@gmail.com (225) 281-8176 — Road Home. Jeff Haley jeff.haley@la.gov (225) 330-0036 — Road Home. Pat Forbes Patrick.Forbes@la.gov (225) 342-1626 — Restore LA. Bubba Orgeron bubbaorgeron@tpsd.org (985) 876-7400 — TPSD. Gregory Harding gregoryharding@tpsd.org (985) 688-0052 — TPSD.\n\nRATE CARD: Principal ' + d + '220, PD ' + d + '210, SME ' + d + '200, Sr Grant Mgr ' + d + '180, Grant Mgr ' + d + '175, Sr PM ' + d + '180, PM ' + d + '155, Grant Writer ' + d + '145, Architect ' + d + '135, Cost Est ' + d + '125, Appeals ' + d + '145, Sr Damage ' + d + '115, Damage ' + d + '105, Admin ' + d + '65.\n\nINSURANCE: ' + d + '5M fidelity bond, ' + d + '5M E&O, ' + d + '2M GL (' + d + '1M per occ/' + d + '2M agg).\n' + pipelineCtx + memCtx + proposalCtx + '\nAnswer concisely. Reference specific opportunities and eval criteria by name when relevant. If you have the proposal draft in context and the user asks about it, reference specific sections. You are the organism — you advise, recommend, and execute. You do not just report. Your feedback on proposals is specific enough to act on: quote the section, name the gap, recommend the exact language.';
    return res.status(200).json({ system_prompt: sys, pipeline_count: (opps||[]).length, memory_count: (mems||[]).length, opp_agency: focusOpp ? (focusOpp.agency||'') : '', has_draft: focusOpp ? (focusOpp.staffing_plan||'').length > 100 : false });
  } catch(e) { return res.status(500).json({ error: e.message }); }
}