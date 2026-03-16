// ── FULL WORKFLOW ─────────────────────────────────────────────────────────────
function FullWorkflow({ sharedCtx={}, saveSharedCtx=()=>{}, goToProposal=()=>{} }) {
  var pl = usePipeline();
  const wfStore = store.get("wfState") || {};
  const [title, setTitle] = useState(wfStore.title || "");
  const [agency, setAgency] = useState(wfStore.agency || "");
  const [rfpUrl, setRfpUrl] = useState(wfStore.rfpUrl || "");
  const [incumbent, setIncumbent] = useState(wfStore.incumbent || "");
  const [intel, setIntel] = useState(wfStore.intel || "");
  const [rfpText, setRfpText] = useState(wfStore.rfpText || "");
  const [fileName, setFileName] = useState(wfStore.fileName || "");
  const [fileLoading, setFileLoading] = useState(false);
  const [step, setStep] = useState(wfStore.step || 0);
  const [outA, setOutA] = useState(wfStore.outA || "");
  const [outB, setOutB] = useState(wfStore.outB || "");
  const [decision, setDecision] = useState(wfStore.decision || "");
  const [opi, setOpi] = useState(wfStore.opi || null);
  const [tab, setTab] = useState("a");
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);
  const [researchStatus, setResearchStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(function() {
    if (pl.selected) {
      var o = pl.selected;
      if (o.title) setTitle(o.title);
      if (o.agency) setAgency(o.agency);
      if (o.source_url) setRfpUrl(o.source_url);
      if (o.incumbent) setIncumbent(o.incumbent);
      if (o.rfp_text) setRfpText(o.rfp_text);
      if (o.scope_analysis) { setOutA(o.scope_analysis); persistWF({ outA: o.scope_analysis, step: 2 }); }
      if (o.research_brief) { saveSharedCtx({ research: o.research_brief }); }
      if (o.capture_action && o.capture_action.includes('PWIN')) {
        setOutB(o.capture_action);
        var dec = extractDecision(o.capture_action);
        var opiVal = extractOPI(o.capture_action) || o.opi_score;
        if (dec) setDecision(dec);
        if (opiVal) setOpi(opiVal);
        persistWF({ outB: o.capture_action, step: 3, decision: dec, opi: opiVal });
      }
    }
  }, [pl.selected]);

  const persistWF = (updates) => {
    store.set("wfState", {...(store.get("wfState")||{}), ...updates});
  };

  const startTimer = () => {
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => { return () => stopTimer(); }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setFileLoading(true);
    try {
      if (file.type === "text/plain") {
        const text = await file.text();
        setRfpText(text);
        setFileLoading(false);
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const mediaType = file.type || "application/octet-stream";
        try {
          const body = {
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            system: "You are a document extraction assistant. Extract all text content from this document. Return only the extracted text, no commentary.",
            messages: [{
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
                { type: "text", text: "Extract all text from this document. Return the full text content only." }
              ]
            }]
          };
          const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const d = await r.json();
          const extracted = d.content ? d.content.filter(b => b.type === "text").map(b => b.text).join("") : "";
          setRfpText(extracted || "Could not extract text from file. Please paste manually.");
        } catch(err) {
          setRfpText("Error extracting file. Please paste the RFP text manually.");
        }
        setFileLoading(false);
      };
      reader.readAsDataURL(file);
    } catch(err) {
      setRfpText("Error reading file. Please paste the RFP text manually.");
      setFileLoading(false);
    }
  };

  const extractDecision = (text) => {
    const t = text.toUpperCase();
    if (t.includes("CONDITIONAL GO")) return "CONDITIONAL GO";
    if (t.includes(": GO") || t.includes("RECOMMENDATION: GO")) return "GO";
    if (t.includes("NO-BID") || t.includes("NO BID")) return "NO-BID";
    if (t.includes("WATCHLIST")) return "WATCHLIST";
    return "";
  };
  const extractOPI = (text) => {
    const m = text.match(/OPI[^:]*:\s*(\d+)/i);
    return m ? parseInt(m[1]) : null;
  };

  const buildPromptA = (rfp) => {
    return "Analyze this RFP for HGI and produce a structured decomposition.\n\n" +
      "HEADER BLOCK:\nRFP Title:\nAgency:\nBuyer Type:\nService Archetype:\nFunding Tags:\nPeriod of Performance:\nKey Dates:\nPricing Type:\nKey Personnel Required:\nEstimated Value:\nGeography:\n\n" +
      "Then provide:\n1) SCOPE SNAPSHOT - 5-8 bullets\n2) DELIVERABLES & REQUIREMENTS\n3) EVALUATION CRITERIA - factor, weight, what evaluators want\n4) COMPLIANCE & PASS-FAIL requirements\n5) KEY PERSONNEL - roles, experience, certs\n6) PRICING REQUIREMENTS\n7) RISKS & GOTCHAS\n\nMark anything missing as: Not Found in Provided Text\n\nRFP TEXT:\n" + rfp;
  };

  const buildPromptB = (decomp, ctx) => {
    return "Produce a COMPREHENSIVE leadership decision brief for HGI (Hammerman & Gainer LLC). This is the document Christopher Oney, President, uses to make the bid/no-bid call. Be thorough, specific, and decisive. Every section must be fully completed.\n\n" +
      "HEADER BLOCK (complete every field):\n" +
      "Opportunity: [full title]\nAgency: [issuing agency]\nDecision Recommendation: GO / CONDITIONAL GO / NO-BID / WATCHLIST\nPwin: [0-100]%\nOPI Score: [0-100]\nPriority Tier: Tier 1 (OPI 70+) / Tier 2 (45-69) / Tier 3 (25-44) / Archive (<25)\nEstimated Value: [dollar amount]\nResponse Deadline: [date]\nRevenue Timing: Immediate (<90d) / Near-term (90-180d) / Medium (180-365d) / Long (365d+)\nStaffing Status: Green / Yellow / Red\nPricing Posture: Aggressive / Competitive / Premium\nIncumbent: [name or None/Unknown]\nEffort Level: Low / Medium / High / Very High\n\n" +
      "1. WHAT THIS IS\n" +
      "8-10 specific bullets naming the actual program, funding source, scope, deliverables, period of performance, and how this fits HGI core verticals.\n\n" +
      "2. WHY HGI WINS THIS\n" +
      "8-10 bullets. Tie each win factor to a specific eval criterion. Reference HGI actual past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years, Jefferson Parish, Terrebonne Parish, Restore Louisiana. Name the specific HGI capability mapping to each requirement.\n\n" +
      "3. WHY HGI LOSES THIS\n" +
      "6-8 bullets. Be brutally honest — incumbent relationships, missing certs, staffing gaps, price sensitivity, geographic disadvantage, past performance gaps. No sugarcoating.\n\n" +
      "4. OPI SCORE BREAKDOWN\n" +
      "Score each sub-factor 0-10 with one-line rationale:\n- Past Performance Match (0-10):\n- Technical Capability Match (0-10):\n- Staffing Depth (0-10):\n- Pricing Competitiveness (0-10):\n- Relationship / Incumbent Position (0-10):\n- Geographic Presence (0-10):\n- Budget Certainty (0-10):\n- Revenue Timing (0-10):\n- Strategic Importance (0-10):\n- Bid/No-Bid Risk (0-10):\nTOTAL OPI: [sum/10 scaled to 100]\nPWIN: [percentage with one-sentence reasoning]\n\n" +
      "5. COMPETITIVE LANDSCAPE\n" +
      "Who else is likely bidding? For each likely competitor: their position (incumbent/challenger), known strengths, relationship with this agency, and how HGI beats them. Name real firms: ICF, Hagerty, Witt O'Brien's, Dewberry, CDM Smith, APTIM, Guidehouse, IEM, Cloudburst.\n\n" +
      "6. PRICING STRATEGY\n" +
      "Recommended approach, target price range, indirect rate considerations, fee structure, PTW recommendation. Price to win or price for margin — make a call.\n\n" +
      "7. STAFFING FEASIBILITY\n" +
      "Key personnel required vs. HGI bench. Specific gaps. Teaming partners needed. Mobilization timeline risk.\n\n" +
      "8. 48-HOUR ACTION PLAN\n" +
      "10 specific, actionable steps. Not generic — name the actual deliverable, the actual person type, the actual deadline. E.g. 'Call agency POC to confirm procurement timeline — BD Director — today by EOD'.\n\n" +
      "9. INTEL GAPS\n" +
      "What do we NOT know that we need before submitting? What calls need to happen? What documents need to be retrieved?\n\n" +
      "10. DECISION LOGIC\n" +
      "One decisive paragraph. Make the call explicitly: GO, CONDITIONAL GO, NO-BID, or WATCHLIST. Explain exactly why. No hedging.\n\n" +
      "DECOMPOSITION:\n" + decomp + "\n\nCONTEXT (use throughout your analysis):\n" + ctx;
  };

  const autoResearch = async (decomp, oppTitle, oppAgency) => {
    const agencyLine = decomp.split("\n").find(l => l.match(/^Agency:/i));
    const detectedAgency = oppAgency || (agencyLine ? agencyLine.replace(/^Agency:\s*/i,"").trim() : "");
    const typeLine = decomp.split("\n").find(l => l.match(/^Service Archetype:/i));
    const detectedType = typeLine ? typeLine.replace(/^Service Archetype:\s*/i,"").trim() : "disaster recovery program management";
    if (!detectedAgency || detectedAgency.includes("Not Found")) {
      setResearchStatus("(no agency detected — add agency name for auto-research)");
      return;
    }
    setResearchStatus("Researching " + detectedAgency + " in background...");
    try {
      const researchPrompt = "Deep competitive research for HGI capture:\nAgency: " + detectedAgency + "\nOpportunity Type: " + detectedType + "\nOpportunity: " + (oppTitle || "TBD") + "\n\nProvide concise intel on:\n1. Agency Profile\n2. Funding Landscape\n3. Competitive Intel\n4. Relationship Map\n5. Win Strategy — 5 specific recommendations\n6. Red Flags\n7. Intel Gaps";
      const r = await callClaude(researchPrompt, "You are a capture intelligence analyst for HGI. Be specific and actionable. " + HGI_CONTEXT);
      saveSharedCtx({ research: r, researchAgency: detectedAgency });
      setResearchStatus("Research complete: " + detectedAgency);
    } catch(e) {
      setResearchStatus("Research failed — run manually in Research & Analysis tab");
    }
  };

  const runA = async () => {
    if (!rfpText.trim() && !title.trim()) return;
    setError("");
    setLoadingA(true);
    setOutA(""); setOutB(""); setDecision(""); setOpi(null);
    startTimer();
    try {
      const rIn = rfpText || "Title: " + title + "\nAgency: " + agency + "\nContext: " + intel;
      const sys = "You are an expert capture manager for HGI (Hammerman & Gainer). " + HGI_CONTEXT + " Extract solicitation requirements precisely. Mark missing info as Not Found in Provided Text.";
      const a = await callClaude(buildPromptA(rIn), sys, 4000);
      stopTimer();
      setElapsed(0);
      setOutA(a);
      setLoadingA(false);
      setTab("a");
      // Auto-extract title and agency from decomposition
      const autoExtract = (text, ...fields) => {
        for (const field of fields) {
          const lines = text.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().startsWith(field.toLowerCase() + ":")) {
              const val = trimmed.slice(field.length + 1).trim();
              if (val && !val.toLowerCase().includes("not found") && val.toLowerCase() !== "tbd" && val.length > 1) return val;
            }
          }
        }
        return "";
      };
      const autoTitle = autoExtract(a, "RFP Title", "Solicitation Title", "Title", "Opportunity Title") || title;
      const autoAgency = autoExtract(a, "Agency", "Issuing Agency", "Contracting Agency") || agency;
      const autoValue = autoExtract(a, "Estimated Value", "Contract Value", "Award Amount") || "";
      const autoDeadline = autoExtract(a, "Proposal Due Date", "Submission Deadline", "Due Date") || "";
      const autoType = autoExtract(a, "Service Archetype", "Contract Type") || "";
      const autoGeo = autoExtract(a, "Geography", "Place of Performance") || "";
      if (autoTitle && autoTitle !== title) setTitle(autoTitle);
      if (autoAgency && autoAgency !== agency) setAgency(autoAgency);
      persistWF({ outA: a, step: 2, title: autoTitle, agency: autoAgency, rfpText: rIn, rfpUrl, incumbent, intel });
      saveSharedCtx({ rfpText: rIn, decomposition: a, title: autoTitle, agency: autoAgency, value: autoValue, deadline: autoDeadline, type: autoType, geography: autoGeo });
      // Fire background tasks — don't await
      if (pl.selected && pl.selected.id) { pl.writeBack(pl.selected.id, { scope_analysis: a, last_updated: new Date().toISOString() }); }
      autoResearch(a, autoTitle, autoAgency);
    } catch(err) {
      stopTimer();
      setError("Step 1 failed: " + err.message);
      setLoadingA(false);
    }
  };

  const runB = async () => {
    setLoadingB(true);
    setError("");
    startTimer();
    try {
      const researchBlock = sharedCtx.research ? "\n\nCOMPETITIVE RESEARCH:\n" + sharedCtx.research.slice(0, 1200) : "";
      const ctx = "Title: " + title + "\nAgency: " + agency + "\nIncumbent: " + (incumbent || "Unknown") + "\nIntel: " + intel + "\nURL: " + rfpUrl + researchBlock;
      const sys = "You are a senior capture executive for HGI. Be analytical, decisive, specific. " + HGI_CONTEXT;
      const b = await callClaude(buildPromptB(outA, ctx), sys, 4000);
      stopTimer();
      setElapsed(0);
      const dec = extractDecision(b);
      const opiVal = extractOPI(b);
      setOutB(b);
      setDecision(dec);
      setOpi(opiVal);
      setLoadingB(false);
      setTab("b");
      persistWF({ outB: b, step: 3, decision: dec, opi: opiVal });
      // Broadcast workflow completion event
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'workflow.completed',
          opportunity_title: title,
          agency: agency,
          source_module: 'full_workflow',
          data: { decision: dec, opi: opiVal }
        })
      }).catch(() => {});
      saveSharedCtx({ execBrief: b });
    } catch(err) {
      stopTimer();
      setError("Step 2 failed: " + err.message);
      setLoadingB(false);
    }
  };

  const smartExtract = (text, ...fields) => {
    if (!text) return "";
    for (const field of fields) {
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().startsWith(field.toLowerCase() + ":")) {
          const val = trimmed.slice(field.length + 1).trim();
          if (val && !val.toLowerCase().includes("not found") && val.toLowerCase() !== "tbd" && val.length > 1) return val;
        }
      }
    }
    return "";
  };

  const buildTrackerEntry = (proposalSections) => {
    const extractedTitle = smartExtract(outA, "RFP Title", "Solicitation Title", "Title", "Opportunity Title") || title || sharedCtx.title || "Untitled";
    const extractedAgency = smartExtract(outA, "Agency", "Issuing Agency", "Contracting Agency", "Client Agency") || agency || sharedCtx.agency || "";
    const extractedValue = smartExtract(outA, "Estimated Value", "Contract Value", "Total Value", "Award Amount", "Budget") || "";
    const extractedDeadline = smartExtract(outA, "Proposal Due Date", "Submission Deadline", "Due Date", "Proposal Deadline") || smartExtract(outA, "Key Dates") || "";
    const extractedType = smartExtract(outA, "Service Archetype", "Contract Type", "Buyer Type", "Program Type") || "";
    const extractedGeo = smartExtract(outA, "Geography", "Place of Performance", "Location", "State") || "";
    const extractedPeriod = smartExtract(outA, "Period of Performance") || "";
    const opiMatch = outB ? outB.split("\n").find(l => l.match(/OPI[^:]*:\s*\d+/i)) : null;
    const extractedOPI = opiMatch ? parseInt(opiMatch.match(/\d+/)[0]) : opi;
    const extractedDecision = decision || smartExtract(outB, "Decision Recommendation", "Recommendation") || "";
    const sectionCount = proposalSections ? Object.keys(proposalSections).length : 0;
    return {
      id: "wf-" + Date.now(),
      title: extractedTitle,
      agency: extractedAgency,
      value: extractedValue,
      deadline: extractedDeadline,
      type: extractedType,
      geography: extractedGeo,
      period: extractedPeriod,
      stage: extractedDecision === "GO" ? "pursuing" : extractedDecision === "CONDITIONAL GO" ? "qualifying" : "proposal",
      decision: extractedDecision,
      opiScore: extractedOPI,
      decomposition: outA,
      execBrief: outB,
      proposal: proposalSections ? Object.entries(proposalSections).map(([k,v]) => "=== " + k.toUpperCase().replace(/_/g," ") + " ===\n" + v).join("\n\n") : "",
      addedDate: new Date().toISOString(),
      notes: (sectionCount > 0 ? sectionCount + " proposal sections drafted · " : "") + "Full workflow · " + new Date().toLocaleDateString()
    };
  };

  const saveToTracker = (proposalSections) => {
    const tracker = store.get("tracker") || [];
    const entry = buildTrackerEntry(proposalSections);
    var newStage = 'identified';
    if (decision === 'GO') newStage = 'pursuing';
    else if (decision === 'CONDITIONAL GO') newStage = 'qualifying';
    else if (decision === 'NO-BID') newStage = 'no_bid';
    var dbUpdate = {
      title: entry.title, agency: entry.agency, estimated_value: entry.value,
      due_date: entry.deadline || sharedCtx.deadline || '',
      vertical: entry.type || sharedCtx.type || 'disaster',
      state: entry.geography ? entry.geography.slice(0,2).toUpperCase() : 'LA',
      opi_score: entry.opiScore, stage: newStage,
      status: decision === 'NO-BID' ? 'no_bid' : 'active',
      scope_analysis: outA || '',
      capture_action: outB ? outB.slice(0, 2000) : '',
      research_brief: sharedCtx.research || '',
      last_updated: new Date().toISOString()
    };
    if (pl.selected && pl.selected.id) {
      pl.writeBack(pl.selected.id, dbUpdate);
    } else {
      dbUpdate.rfp_text = entry.decomposition ? entry.decomposition.slice(0, 10000) : '';
      dbUpdate.discovered_at = new Date().toISOString();
      dbUpdate.source = 'Full Workflow';
      fetch('/api/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dbUpdate) }).catch(function() {});
    }
    store.set("tracker", [entry, ...tracker]);
    saveSharedCtx({ title: entry.title, agency: entry.agency, value: entry.value, deadline: entry.deadline, type: entry.type });
  };

  const runC = () => {
    saveToTracker();
    saveSharedCtx({ rfpText: rfpText || sharedCtx.rfpText, decomposition: outA, execBrief: outB, title: sharedCtx.title || title, agency: sharedCtx.agency || agency });
    goToProposal("executive_summary");
  };

  const saveNoProposal = () => {
    saveToTracker();
    alert("✓ Saved to Pipeline Tracker!");
  };
  const decColor = decision === "GO" ? GREEN : decision === "CONDITIONAL GO" ? GOLD : decision === "NO-BID" ? RED : TEXT_D;
  const hasResult = outA || outB;
  const isStep2Done = !!outB;

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Full Workflow</h2>
        <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>RFP Decomposition → Executive Brief + OPI → Proposal Package</p>
      </div>

      {React.createElement(OpportunitySelector, { pipeline: pl.pipeline, selected: pl.selected, onSelect: pl.select, loading: pl.loading, label: 'SELECT EXISTING OPPORTUNITY OR START NEW BELOW' })}
      {error && <div style={{marginBottom:16,padding:"10px 14px",background:RED+"15",border:`1px solid ${RED}44`,borderRadius:4,color:RED,fontSize:13}}>{error}</div>}

      {/* Input form — always show if no results yet */}
      {!hasResult && !loadingA && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><Label text="OPPORTUNITY TITLE" /><Input value={title} onChange={setTitle} placeholder="e.g. FEMA PA TPA — Jefferson Parish" /></div>
            <div><Label text="AGENCY" /><Input value={agency} onChange={setAgency} placeholder="e.g. Jefferson Parish OEM" /></div>
            <div><Label text="KNOWN INCUMBENT" /><Input value={incumbent} onChange={setIncumbent} placeholder="e.g. ICF / None / Unknown" /></div>
            <div><Label text="RFP URL (optional)" /><Input value={rfpUrl} onChange={setRfpUrl} placeholder="https://..." /></div>
          </div>
          <div><Label text="RELATIONSHIP INTEL / CONTEXT" /><Textarea value={intel} onChange={setIntel} placeholder="Known relationships, budget intel, political context..." rows={2} /></div>
          <div>
            <Label text="RFP / SOLICITATION TEXT" />
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
              <label style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px",background:BG4,
                border:`1px solid ${BORDER}`,borderRadius:4,cursor:"pointer",fontSize:12,color:TEXT_D}}>
                <span>? Upload PDF / Word / TXT</span>
                <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileUpload} style={{display:"none"}} />
              </label>
              {fileLoading && <span style={{color:GOLD,fontSize:12,animation:"pulse 1.2s infinite"}}>Extracting text from file...</span>}
              {fileName && !fileLoading && <span style={{color:GREEN,fontSize:12}}>✓ {fileName}</span>}
            </div>
            <Textarea value={rfpText} onChange={setRfpText} placeholder="Paste RFP text here, or upload a file above..." rows={8} />
          </div>
          <Btn onClick={runA} disabled={!rfpText.trim() && !title.trim()} style={{alignSelf:"flex-start"}}>
            Step 1: Analyze RFP
          </Btn>
        </div>
      )}

      {/* Loading state for Step 1 */}
      {loadingA && (
        <Card style={{border:`1px solid ${GOLD}44`,padding:32,textAlign:"center"}}>
          <div style={{color:GOLD,fontSize:18,fontWeight:700,marginBottom:12,animation:"pulse 1.2s infinite"}}>⟳ Analyzing RFP...</div>
          <div style={{color:TEXT_D,fontSize:13,marginBottom:8}}>Extracting scope, evaluation criteria, compliance, staffing, and risks</div>
          <div style={{color:GOLD,fontSize:28,fontWeight:800,margin:"10px 0"}}>{elapsed}s</div>
          <div style={{color:TEXT_D,fontSize:11}}>Typical: 30–90 seconds for large RFPs</div>
        </Card>
      )}

      {/* Results */}
      {hasResult && !loadingA && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              {outA && <span style={{color:GREEN,fontSize:13}}>✓ Step 1 Complete</span>}
              {outB && <span style={{color:GREEN,fontSize:13}}>✓ Step 2 Complete</span>}
              {decision && <span style={{color:decColor,fontWeight:700,fontSize:14}}>{decision}</span>}
              {opi !== null && <OPIBadge score={opi} />}
              <Btn small variant="secondary" style={{marginLeft:"auto"}} onClick={()=>{setOutA("");setOutB("");setDecision("");setOpi(null);setRfpText("");setTitle("");setAgency("");setError("");}}>New Workflow</Btn>
            </div>
          </Card>

          {loadingB && (
            <Card style={{border:`1px solid ${GOLD}44`,padding:32,textAlign:"center",marginBottom:16}}>
              <div style={{color:GOLD,fontSize:18,fontWeight:700,marginBottom:12,animation:"pulse 1.2s infinite"}}>⟳ Generating Executive Brief...</div>
              <div style={{color:GOLD,fontSize:28,fontWeight:800,margin:"10px 0"}}>{elapsed}s</div>
              <div style={{color:TEXT_D,fontSize:11}}>Typical: 30–60 seconds</div>
            </Card>
          )}

          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            {[["a","📋 Decomposition"],["b","🎯 Executive Brief"],["c","🔍 Intel & Analysis"]].map(([id,label]) => (
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:"6px 14px",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit",
                background:tab===id?GOLD:BG3,color:tab===id?"#000":TEXT_D,
                border:`1px solid ${tab===id?GOLD:BORDER}`,fontWeight:tab===id?700:400
              }}>{label}</button>
            ))}
          </div>

          {tab === "a" && (
            <div>
              <AIOut content={outA} label="RFP DECOMPOSITION" />
              {outA && !outB && !loadingB && (
                <div style={{marginTop:12}}>
                  {researchStatus && (
                    <div style={{marginBottom:10,padding:"7px 12px",borderRadius:4,fontSize:12,
                      background:researchStatus.includes("complete")?GREEN+"15":GOLD+"15",
                      border:`1px solid ${researchStatus.includes("complete")?GREEN:GOLD}44`,
                      color:researchStatus.includes("complete")?GREEN:GOLD}}>
                      {researchStatus.includes("complete") ? "✓ " : "⟳ "}{researchStatus}
                    </div>
                  )}
                  <Btn onClick={runB}>Step 2: Executive Brief + OPI</Btn>
                </div>
              )}
            </div>
          )}

          {tab === "b" && (
            <div>
              <AIOut content={outB} label="EXECUTIVE DECISION BRIEF" />
              {outB && !loadingB && (
                <div style={{marginTop:16}}>
                  <div style={{marginBottom:10,padding:"10px 14px",background:GREEN+"15",border:`1px solid ${GREEN}44`,borderRadius:4,fontSize:12,color:GREEN}}>
                    ✓ Full brief complete — OPI scored, competitive landscape mapped, 48-hour action plan ready
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Btn onClick={runC}>Step 3: Build Proposal in Proposal Engine →</Btn>
                    <Btn variant="secondary" onClick={saveNoProposal}>💾 Save to Tracker</Btn>
                    <Btn variant="ghost" onClick={()=>setTab("c")}>🔍 Intel & Analysis →</Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "c" && (
            <div>
              {sharedCtx.research ? (
                <div>
                  <AIOut content={sharedCtx.research} label="COMPETITIVE INTELLIGENCE & AGENCY RESEARCH" />
                  <div style={{marginTop:12,padding:"8px 12px",background:BG3,borderRadius:4,fontSize:11,color:TEXT_D}}>
                    Auto-generated from RFP decomposition · Flows into Proposal Engine and Financial Pricing automatically
                  </div>
                </div>
              ) : (
                <Card style={{padding:32,textAlign:"center"}}>
                  <div style={{color:TEXT_D,fontSize:13,marginBottom:12}}>
                    {researchStatus && researchStatus.includes("Researching") ? (
                      <span style={{color:GOLD,animation:"pulse 1.2s infinite"}}>⟳ {researchStatus}</span>
                    ) : outA ? (
                      <span style={{color:TEXT_D}}>{researchStatus || "Research runs automatically after Step 1 — or click below to run now."}</span>
                    ) : (
                      <span>Complete Step 1 to trigger auto-research on this agency.</span>
                    )}
                  </div>
                  {outA && (
                    <Btn small variant="ghost" onClick={()=>autoResearch(outA, title, agency)}>⟳ Run Research Now</Btn>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
