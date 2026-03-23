// api/submission-assembly.js
// Triggered after generate-doc completes. Builds a submission package record:
// - Links the Word doc already generated
// - Lists all known exhibits and their status
// - Generates a submission checklist
// - Writes submission_package_url back to the opportunity
export const config = { maxDuration: 60 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const AK = process.env.ANTHROPIC_API_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
const BUCKET = 'knowledge-docs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var oppId = (req.query && req.query.opp) || (req.body && req.body.opportunity_id) || '';
  if (!oppId) return res.status(400).json({ error: 'opp query param or opportunity_id required' });

  try {
    // Load full opportunity record
    var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(oppId) + '&select=id,title,agency,vertical,due_date,scope_analysis,staffing_plan,rfp_document_url,capture_action&limit=1', { headers: H });
    var opps = await oppR.json();
    if (!opps || !opps.length) return res.status(404).json({ error: 'Opportunity not found' });
    var opp = opps[0];

    var d = String.fromCharCode(36);

    // Step 1: Use Haiku to extract required exhibits/forms from the scope analysis
    var exhibitList = [];
    if ((opp.scope_analysis||'').length > 100) {
      try {
        var exR = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            system: 'Extract required submission items from an RFP scope. Return ONLY a JSON array of strings — each string is one required item (exhibit, form, certification, copy requirement, etc). Example: ["Exhibit A - Staffing Plan", "Exhibit B - Price Schedule", "5 hard copies within 3 business days", "SAM.gov registration printout"]. No markdown, no explanation.',
            messages: [{ role: 'user', content: 'RFP SCOPE:\n' + (opp.scope_analysis||'').slice(0, 4000) + '\n\nList every required submission item, exhibit, form, and copy requirement.' }]
          })
        });
        var exD = await exR.json();
        var exText = (exD.content || []).filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('').replace(/```json|```/g, '').trim();
        exhibitList = JSON.parse(exText);
      } catch(e) { exhibitList = ['[Could not parse exhibits from scope — review RFP manually]']; }
    }

    // Step 2: Check what is already in storage for this opp
    var wordDocUrl = opp.rfp_document_url || null;
    var hasWordDoc = !!wordDocUrl;
    var hasDraft = (opp.staffing_plan||'').length > 500;

    // Step 3: Build checklist — mark each item as READY, PENDING, or MISSING
    var checklist = [];

    // Core proposal document
    checklist.push({ item: 'Proposal Word Document (.docx)', status: hasWordDoc ? 'READY' : (hasDraft ? 'PENDING — run generate-doc' : 'MISSING — no draft'), url: wordDocUrl || null });

    // Exhibits from RFP
    for (var ei = 0; ei < exhibitList.length; ei++) {
      var item = exhibitList[ei];
      // Auto-detect items HGI can self-generate vs items needing physical action
      var isAutoGen = /staffing|price|cost|rate|schedule|budget|exhibit a/i.test(item);
      var isPhysical = /hard cop|notariz|sign|original|wet ink|certif|bond|insurance|sam.gov/i.test(item);
      checklist.push({
        item: item,
        status: isPhysical ? 'ACTION REQUIRED — physical document' : (isAutoGen ? 'PENDING — auto-generate' : 'PENDING — team review'),
        auto_gen: isAutoGen,
        physical: isPhysical
      });
    }

    // Standard items always required
    checklist.push({ item: 'SAM.gov Registration Printout (UEI: DL4SJEVKZ6H4)', status: 'ACTION REQUIRED — print from SAM.gov', physical: true });
    checklist.push({ item: 'Certificate of Insurance (E&O ' + d + '5M, GL ' + d + '2M, Fidelity ' + d + '5M)', status: 'ACTION REQUIRED — request from Leslie Turner', physical: true });

    // Step 4: Compute readiness score
    var ready = checklist.filter(function(c) { return c.status === 'READY'; }).length;
    var pending = checklist.filter(function(c) { return c.status.indexOf('PENDING') === 0; }).length;
    var actionRequired = checklist.filter(function(c) { return c.status.indexOf('ACTION REQUIRED') === 0; }).length;
    var total = checklist.length;
    var readinessPct = Math.round((ready / total) * 100);

    // Step 5: Build submission package record and store in Supabase Storage as JSON
    var pkg = {
      opportunity_id: oppId,
      title: opp.title,
      agency: opp.agency,
      due_date: opp.due_date,
      assembled_at: new Date().toISOString(),
      word_doc_url: wordDocUrl,
      checklist: checklist,
      summary: {
        total_items: total,
        ready: ready,
        pending: pending,
        action_required: actionRequired,
        readiness_pct: readinessPct
      }
    };

    var pkgFilename = 'submissions/submission_package_' + (opp.agency||'').replace(/[^a-zA-Z0-9]/g,'_').slice(0,40) + '_' + Date.now() + '.json';
    var pkgBuffer = Buffer.from(JSON.stringify(pkg, null, 2));
    await fetch(SB + '/storage/v1/object/' + BUCKET + '/' + pkgFilename, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body: pkgBuffer
    });
    var pkgUrl = SB + '/storage/v1/object/public/' + BUCKET + '/' + pkgFilename;

    // Step 6: Write package URL back to opportunity
    await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(oppId), {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ capture_action: 'SUBMISSION PACKAGE: ' + readinessPct + '% ready | ' + ready + ' ready, ' + pending + ' pending, ' + actionRequired + ' action required | Package: ' + pkgUrl + '\n\n' + (opp.capture_action||'').slice(0,1500), last_updated: new Date().toISOString() })
    });

    return res.status(200).json({
      success: true,
      opportunity_id: oppId,
      title: opp.title,
      agency: opp.agency,
      readiness_pct: readinessPct,
      checklist_items: total,
      ready: ready,
      pending: pending,
      action_required: actionRequired,
      package_url: pkgUrl,
      checklist: checklist
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}