// ── OPPORTUNITY DISCOVERY ENGINE ─────────────────────────────────────────────
function OpportunityDiscovery({ saveSharedCtx, goToWorkflow }) {
  const [activeTab, setActiveTab] = useState("hunt");
  const [hunting, setHunting] = useState(false);
  const [huntResults, setHuntResults] = useState(() => store.get("huntResults") || []);
  const [lastHunted, setLastHunted] = useState(() => store.get("lastHunted") || null);
  const [selectedResult, setSelectedResult] = useState(null);
  const [sendingToWorkflow, setSendingToWorkflow] = useState(null);
  const [huntConfig, setHuntConfig] = useState(() => store.get("huntConfig") || {
    verticals: ["disaster","tpa","workforce","health","infrastructure","tax_appeals","federal"],
    states: ["LA","TX","FL","MS","AL","GA"],
    minValue: 0,
    urgentDays: 21,
    sources: ["sam","state_procurement","insurance_assoc","municipal","federal_grants","disaster_signals"]
  });
  const [disasterAlerts, setDisasterAlerts] = useState(() => store.get("disasterAlerts") || []);
  const [fundingAlerts, setFundingAlerts] = useState(() => store.get("fundingAlerts") || []);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [filterVertical, setFilterVertical] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [sortBy, setSortBy] = useState("opi");

  // ── DOCUMENT RETRIEVAL STATE ──
  const [fetchUrl, setFetchUrl] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchResult, setFetchResult] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [retrievedDocs, setRetrievedDocs] = useState(() => store.get("retrievedDocs") || []);
  const [analyzingDoc, setAnalyzingDoc] = useState(null);
  const [oppFetchStatus, setOppFetchStatus] = useState({}); // per-opportunity fetch status

  // ── FETCH RFP FROM URL ──
  const fetchRfp = async (url, oppId = null) => {
    if (!url) return;
    if (oppId) setOppFetchStatus(s => ({...s, [oppId]: "fetching"}));
    else { setFetchLoading(true); setFetchError(null); setFetchResult(null); }

    try {
      const res = await fetch("/api/fetch-rfp", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ url })
      });
      const data = await res.json();

      if (!data.success) {
        const errMsg = data.error || "Could not retrieve page";
        if (oppId) setOppFetchStatus(s => ({...s, [oppId]: "error: " + errMsg}));
        else { setFetchError(errMsg); setFetchLoading(false); }
        return null;
      }

      if (oppId) setOppFetchStatus(s => ({...s, [oppId]: "analyzing"}));
      else setFetchResult(data);

      // Analyze the retrieved content with Claude
      const docContent = data.textContent || "";
      const docLinks = data.docLinks || [];
      const fetchedDocs = data.fetchedDocs || [];

      // Build analysis prompt
      const analysisPrompt = `Analyze this procurement opportunity page retrieved from: ${url}

PAGE TITLE: ${data.title || "Unknown"}
${data.samData ? "SAM.GOV DATA: " + JSON.stringify(data.samData) : ""}
${data.lapacData ? "LAPAC DATA: " + JSON.stringify(data.lapacData) : ""}

PAGE CONTENT (first 8000 chars):
${docContent.slice(0, 8000)}

DOCUMENT LINKS FOUND: ${docLinks.map(d => d.name + " — " + d.url).join("\n")}

${fetchedDocs.length > 0 ? "DOCUMENTS RETRIEVED: " + fetchedDocs.map(d => d.name).join(", ") : ""}

Extract and return as JSON:
{
  "title": "opportunity title",
  "agency": "issuing agency",
  "solicitationNumber": "solicitation/bid number if found",
  "dueDate": "response/submission deadline",
  "estimatedValue": "contract value if mentioned",
  "setAside": "set-aside status",
  "naics": "NAICS code if listed",
  "description": "2-3 sentence summary of what this contract is",
  "scopeOfWork": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"],
  "keyRequirements": ["requirement 1", "requirement 2"],
  "isRfp": true/false,
  "rfpText": "full extracted RFP text suitable for HGI Full Workflow — as much detail as possible",
  "documentLinks": [{"name": "...", "url": "..."}],
  "hgiRelevance": "HIGH|MEDIUM|LOW",
  "hgiFit": "1-2 sentences on why or why not this fits HGI",
  "immediateAction": "what HGI should do right now"
}`;

      const analysis = await callClaude(analysisPrompt,
        "You are an expert government contracting analyst for HGI. Extract all procurement data from the provided page content. Return ONLY valid JSON.",
        3000
      );

      let analyzed;
      try {
        const clean = analysis.replace(/```json|```/g,"").trim();
        const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
        analyzed = JSON.parse(clean.slice(s, e+1));
      } catch(err) {
        analyzed = { title: data.title, description: docContent.slice(0,300), rfpText: docContent };
      }

      // Attach doc links from retrieval
      analyzed.documentLinks = [...(analyzed.documentLinks||[]), ...docLinks.slice(0,10)];
      analyzed.fetchedDocs = fetchedDocs;
      analyzed.sourceUrl = url;
      analyzed.retrievedAt = new Date().toISOString();

      // Save to retrieved docs library
      const newDoc = { id: Date.now(), ...analyzed };
      const updated = [newDoc, ...retrievedDocs.filter(d => d.sourceUrl !== url)].slice(0, 50);
      setRetrievedDocs(updated);
      store.set("retrievedDocs", updated);

      if (oppId) {
        setOppFetchStatus(s => ({...s, [oppId]: "done"}));
        // Also update the hunt result with the analyzed data
        setHuntResults(prev => prev.map(o => o.id === oppId ? {
          ...o,
          description: analyzed.description || o.description,
          scopeOfWork: analyzed.scopeOfWork || o.scopeOfWork,
          solicitationNumber: analyzed.solicitationNumber,
          dueDate: analyzed.dueDate,
          rfpText: analyzed.rfpText,
          documentsRetrieved: true,
          documentLinks: analyzed.documentLinks,
        } : o));
      } else {
        setFetchResult({...data, analyzed});
        setFetchLoading(false);
      }

      return analyzed;
    } catch(err) {
      console.error("fetchRfp error:", err);
      if (oppId) setOppFetchStatus(s => ({...s, [oppId]: "error: " + err.message}));
      else { setFetchError(err.message); setFetchLoading(false); }
      return null;
    }
  };

  // Send retrieved doc to Full Workflow
  const sendDocToWorkflow = (doc) => {
    saveSharedCtx({
      title: doc.title || "Retrieved Opportunity",
      agency: doc.agency || "",
      rfpText: doc.rfpText || doc.description || "",
      decomposition: "",
      execBrief: "",
    });
    goToWorkflow();
  };

  const VERTICALS = [
    {id:"disaster", label:"Disaster Recovery / CDBG-DR", icon:"?"},
    {id:"tpa", label:"TPA / Claims / Insurance", icon:"?"},
    {id:"workforce", label:"Workforce & Social Services", icon:"?"},
    {id:"health", label:"Health & Human Services", icon:"?"},
    {id:"infrastructure", label:"Infrastructure & Capital", icon:"?"},
    {id:"tax_appeals", label:"Property Tax Appeals", icon:"?"},
    {id:"federal", label:"Federal Agencies", icon:"⚪"},
  ];

  const SOURCES = [
    {id:"sam", label:"SAM.gov", desc:"Federal contracting opportunities"},
    {id:"state_procurement", label:"State Procurement Portals", desc:"LA/TX/FL/MS/AL/GA state portals"},
    {id:"insurance_assoc", label:"Insurance Associations", desc:"LA Citizens, TX Windpool, FL Citizens, TPCIGA"},
    {id:"municipal", label:"Municipal & Parish", desc:"Cities, parishes, counties, housing authorities"},
    {id:"federal_grants", label:"Federal Grant Signals", desc:"HUD, FEMA, Treasury, USDA allocations"},
    {id:"disaster_signals", label:"Disaster & Funding Signals", desc:"Declarations, BRIC/HMGP notices, DR allocations"},
  ];

  const STATE_AGENCIES = {
    LA: ["Louisiana Housing Corporation (LHC)", "GOHSEP", "OCD-DRU", "Louisiana Citizens Property Insurance", "Louisiana Workforce Commission", "Louisiana Department of Health", "LCDBG", "LaPAC", "City of New Orleans", "East Baton Rouge Parish", "Jefferson Parish", "Terrebonne Parish", "All Louisiana Housing Authorities"],
    TX: ["Texas GLO", "TDEM", "Texas Windstorm Insurance Association (TWIA)", "TPCIGA", "Texas SmartBuy", "Texas Housing Finance Agencies", "Major Texas metros", "County appraisal districts"],
    FL: ["Florida DEO", "Florida Division of Emergency Management (FDEM)", "Florida Citizens Property Insurance", "Florida Housing Finance Corporation", "Major Florida counties", "County property appraisers / tax authorities"],
    MS: ["MEMA", "Mississippi Development Authority (MDA)", "Mississippi Home Corporation", "State procurement portal", "Municipal contracts", "County tax appeal boards"],
    AL: ["AEMA", "Alabama Housing Finance Authority", "State procurement", "Municipal and county opportunities"],
    GA: ["GEMA", "Georgia DCA", "Atlanta metro agencies", "Municipal tax administration", "Workforce agencies"],
  };

  const [expandedCard, setExpandedCard] = useState(null);

  // ── REAL DATA FROM SUPABASE ──
  const loadOpportunities = async (filters = {}) => {
    setHunting(true);
    try {
      const params = new URLSearchParams({
        includeRuns: "true",
        includeSignals: "true",
        limit: "100",
        sort: "opi_score.desc",
        ...filters,
      });
      const res = await fetch(`/api/opportunities?${params}`);
      const data = await res.json();
      if (data.opportunities) {
        // Map from snake_case DB fields to camelCase UI fields
        const mapped = data.opportunities.map(o => ({
          id: o.id,
          title: o.title,
          agency: o.agency,
          state: o.state,
          vertical: o.vertical,
          estimatedValue: o.estimated_value,
          timing: o.due_date ? `Due: ${o.due_date}` : o.timing || "See source",
          source: o.source,
          sourceUrl: o.source_url,
          opiScore: o.opi_score,
          urgency: o.urgency,
          strategicImportance: o.strategic_importance,
          recompete: o.recompete,
          incumbent: o.incumbent,
          description: o.description,
          scopeOfWork: o.scope_of_work,
          whyHgiWins: o.why_hgi_wins,
          keyRequirements: o.key_requirements,
          captureAction: o.capture_action,
          hgiRelevance: o.hgi_relevance,
          hgiFit: o.hgi_fit,
          rfpText: o.rfp_text,
          solicitationNumber: o.solicitation_number,
          dueDate: o.due_date,
          naics: o.naics,
          setAside: o.set_aside,
          documentLinks: o.documents || [],
          documentsRetrieved: o.documents_fetched,
          savedToTracker: o.saved_to_tracker,
          discoveredAt: o.discovered_at,
          analyzedAt: o.analyzed_at,
        }));
        setHuntResults(mapped);
        store.set("huntResults", mapped);
      }
      if (data.huntRuns?.length > 0) {
        setLastHunted(data.huntRuns[0].run_at);
        store.set("lastHunted", data.huntRuns[0].run_at);
      }
      if (data.signals) {
        const disaster = data.signals.filter(s => s.type === "disaster");
        const funding = data.signals.filter(s => s.type === "funding");
        setDisasterAlerts(disaster);
        setFundingAlerts(funding);
      }
    } catch(err) {
      console.error("Load opportunities error:", err);
    }
    setHunting(false);
  };

  const triggerHunt = async () => {
    setHunting(true);
    try {
      const res = await fetch("/api/hunt", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // After hunt completes, reload from DB
        await loadOpportunities();
        alert(`✓ Hunt complete — ${data.fetched} opportunities fetched, ${data.analyzed} analyzed and scored`);
      } else {
        alert("Hunt encountered an error: " + (data.error || "Unknown error"));
      }
    } catch(err) {
      alert("Hunt failed: " + err.message);
    }
    setHunting(false);
  };

  // Load on mount
  useEffect(() => { loadOpportunities(); }, []);

  useEffect(() => {
    const fetchFemaDeclarations = async () => {
      try {
        const res = await fetch('/api/disaster-monitor');
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setDisasterAlerts(prev => {
              const combined = [...data, ...prev];
              const seen = new Set();
              return combined.filter(d => {
                const key = d.disasterNumber || d.event || d.title || JSON.stringify(d);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            });
          }
        }
      } catch(e) {}
    };
    fetchFemaDeclarations();
    const interval = setInterval(fetchFemaDeclarations, 300000); // every 5 min
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchBudgetSignals = async () => {
      try {
        const res = await fetch('/api/budget-signals');
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setFundingAlerts(prev => {
              const combined = [...data, ...prev];
              const seen = new Set();
              return combined.filter(d => {
                const key = d.title || JSON.stringify(d);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            });
          }
        }
      } catch(e) {}
    };
    fetchBudgetSignals();
    const interval = setInterval(fetchBudgetSignals, 600000); // every 10 min
    return () => clearInterval(interval);
  }, []);

  const sendToWorkflow = (opp) => {
    setSendingToWorkflow(opp.id);
    const rfpContext = `OPPORTUNITY: ${opp.title}\nAGENCY: ${opp.agency}\nSTATE: ${opp.state}\nVERTICAL: ${opp.vertical}\nESTIMATED VALUE: ${opp.estimatedValue}\nTIMING: ${opp.timing}\nSOURCE: ${opp.source}\nWHY HGI WINS: ${Array.isArray(opp.whyHgiWins) ? opp.whyHgiWins.join("; ") : opp.whyHgiWins}\nINCUMBENT: ${opp.incumbent || "Unknown"}\nOPI SCORE: ${opp.opiScore}`;
    saveSharedCtx({ title: opp.title, agency: opp.agency, rfpText: rfpContext, decomposition: "", execBrief: "" });
    setTimeout(() => { setSendingToWorkflow(null); goToWorkflow(); }, 300);
  };

  const saveToTracker = (opp) => {
    const tracker = store.get("tracker") || [];
    const entry = {
      id: opp.id,
      title: opp.title,
      agency: opp.agency,
      value: opp.estimatedValue,
      stage: opp.urgency === "IMMEDIATE" ? "pursuing" : "identified",
      decision: opp.opiScore >= 70 ? "GO" : opp.opiScore >= 50 ? "CONDITIONAL GO" : "WATCHLIST",
      opiScore: opp.opiScore,
      geography: opp.state,
      type: opp.vertical,
      addedDate: new Date().toISOString(),
      notes: `Discovered via Hunt Engine · ${opp.timing} · ${opp.source}`,
    };
    store.set("tracker", [entry, ...tracker]);
    const updated = huntResults.map(r => r.id === opp.id ? {...r, savedToTracker: true} : r);
    setHuntResults(updated);
    store.set("huntResults", updated);
  };

  // Filter and sort results
  const filtered = huntResults.filter(o => {
    if (filterVertical !== "all" && o.vertical !== filterVertical) return false;
    if (filterState !== "all" && o.state !== filterState) return false;
    if (filterUrgent && o.urgency !== "IMMEDIATE") return false;
    return true;
  }).sort((a,b) => {
    if (sortBy === "opi") return (b.opiScore||0) - (a.opiScore||0);
    if (sortBy === "urgency") { const u={"IMMEDIATE":0,"ACTIVE":1,"PIPELINE":2,"WATCH":3}; return (u[a.urgency]||3)-(u[b.urgency]||3); }
    if (sortBy === "value") return (parseFloat((b.estimatedValue||"0").replace(/[^0-9.]/g,""))||0) - (parseFloat((a.estimatedValue||"0").replace(/[^0-9.]/g,""))||0);
    return 0;
  });

  const urgencyColor = u => u==="IMMEDIATE"?RED:u==="ACTIVE"?GOLD:u==="PIPELINE"?BLUE:TEXT_D;
  const tierColor = t => t==="TIER_1"?GREEN:t==="TIER_2"?GOLD:TEXT_D;
  const verticalIcon = v => VERTICALS.find(x=>x.id===v)?.icon || "◆";
  const opiColor = s => s>=75?GREEN:s>=55?GOLD:s>=35?ORANGE:RED;

  const TABS = [
    {id:"hunt", label:"? Hunt Engine"},
    {id:"results", label:`? Results ${huntResults.length>0?"("+huntResults.length+")":""}`},
    {id:"retrieve", label:`? Retrieve Docs ${retrievedDocs.length>0?"("+retrievedDocs.length+")":""}`},
    {id:"signals", label:`⚡ Signals ${(disasterAlerts.length+fundingAlerts.length)>0?"("+(disasterAlerts.length+fundingAlerts.length)+")":""}`},
    {id:"sources", label:"? Sources & Config"},
  ];

  return (
    <div>
      <div style={{marginBottom:4}}>
        <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Opportunity Discovery Engine</h2>
        <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>Hunt · Find · Score · Recommend · Win — across all HGI verticals simultaneously</p>
      </div>

      {/* Status bar */}
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        {[
          ["Total Hunted", huntResults.length, GOLD],
          ["Tier 1", huntResults.filter(o=>o.strategicImportance==="TIER_1"||o.opiScore>=75).length, GREEN],
          ["Immediate Action", huntResults.filter(o=>o.urgency==="IMMEDIATE").length, RED],
          ["Saved to Tracker", huntResults.filter(o=>o.savedToTracker).length, BLUE],
          ["Signals", disasterAlerts.length+fundingAlerts.length, ORANGE],
        ].map(([l,v,c])=>(
          <div key={l} style={{background:BG2,border:`1px solid ${c}33`,borderRadius:6,padding:"8px 14px",flex:1,minWidth:100,borderBottom:`3px solid ${c}44`}}>
            <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:10,color:TEXT_D,letterSpacing:"0.06em"}}>{l.toUpperCase()}</div>
          </div>
        ))}
        {lastHunted && <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 14px",flex:1,minWidth:120}}>
          <div style={{fontSize:11,color:GREEN,fontWeight:700}}>Last Hunt</div>
          <div style={{fontSize:10,color:TEXT_D}}>{new Date(lastHunted).toLocaleDateString()} {new Date(lastHunted).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div>
        </div>}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"7px 16px",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit",border:"none",background:activeTab===t.id?GOLD:BG3,color:activeTab===t.id?"#000":TEXT_D,fontWeight:activeTab===t.id?700:400}}>{t.label}</button>
        ))}
      </div>

      {/* ── HUNT ENGINE ── */}
      {activeTab === "hunt" && (
        <div>
          <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:14,marginBottom:4}}>HUNT ENGINE</div>
            <div style={{color:TEXT_D,fontSize:12,marginBottom:16}}>
              Scans all HGI verticals simultaneously — Disaster Recovery, TPA/Claims, Property Tax Appeals, Workforce, Health, Infrastructure, Federal. 
              Generates a ranked, scored opportunity list with immediate action flags.
            </div>

            {/* Vertical toggles */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:TEXT_D,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>ACTIVE VERTICALS</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {VERTICALS.map(v=>(
                  <button key={v.id} onClick={()=>{
                    const cur = huntConfig.verticals;
                    const next = cur.includes(v.id) ? cur.filter(x=>x!==v.id) : [...cur,v.id];
                    const nc = {...huntConfig, verticals:next}; setHuntConfig(nc); store.set("huntConfig",nc);
                  }} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600,border:"none",
                    background:huntConfig.verticals.includes(v.id)?GOLD+"33":BG3,
                    color:huntConfig.verticals.includes(v.id)?GOLD:TEXT_D,
                    outline:huntConfig.verticals.includes(v.id)?`1px solid ${GOLD}55`:"none"}}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* State toggles */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:TEXT_D,fontWeight:700,letterSpacing:"0.08em",marginBottom:8}}>PRIORITY STATES</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["LA","TX","FL","MS","AL","GA","Federal"].map(s=>(
                  <button key={s} onClick={()=>{
                    const cur = huntConfig.states;
                    const next = cur.includes(s) ? cur.filter(x=>x!==s) : [...cur,s];
                    const nc = {...huntConfig, states:next}; setHuntConfig(nc); store.set("huntConfig",nc);
                  }} style={{padding:"5px 14px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700,border:"none",
                    background:huntConfig.states.includes(s)?GOLD+"33":BG3,
                    color:huntConfig.states.includes(s)?GOLD:TEXT_D,
                    outline:huntConfig.states.includes(s)?`1px solid ${GOLD}55`:"none"}}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <Btn onClick={triggerHunt} disabled={hunting} style={{minWidth:180}}>
                {hunting ? "⟳ Hunting..." : "? Run Full Hunt Now"}
              </Btn>
              <Btn variant="ghost" onClick={()=>loadOpportunities()} disabled={hunting}>
                ⟳ Refresh from Database
              </Btn>
              {hunting && <div style={{color:TEXT_D,fontSize:12,animation:"pulse 1.5s infinite"}}>
                Scanning SAM.gov · LaPAC · Analyzing with AI · Scoring against HGI profile...
              </div>}
            </div>
            <div style={{marginTop:10,padding:"8px 12px",background:BG3,borderRadius:4,fontSize:11,color:TEXT_D}}>
              ? Hunt runs automatically every morning at 7am. Results are fully analyzed and scored before you see them — real RFP data, real documents, real OPI scores based on actual opportunity requirements vs HGI capabilities. Click <strong style={{color:GOLD}}>Refresh from Database</strong> to load latest results, or <strong style={{color:GOLD}}>Run Full Hunt Now</strong> to trigger an immediate scan.
            </div>
          </Card>

          {/* Quick preview of top results */}
          {huntResults.length > 0 && (
            <div>
              <div style={{color:GOLD_D,fontSize:11,fontWeight:700,letterSpacing:"0.1em",marginBottom:10}}>
                TOP OPPORTUNITIES — {huntResults.filter(o=>o.urgency==="IMMEDIATE").length} IMMEDIATE ACTION REQUIRED
              </div>
              {huntResults.filter(o=>o.urgency==="IMMEDIATE"||o.strategicImportance==="TIER_1"||(o.opiScore||0)>=75).slice(0,5).map(opp=>(
                <Card key={opp.id} style={{marginBottom:10,border:`1px solid ${urgencyColor(opp.urgency)}44`,cursor:"pointer"}} onClick={()=>{setExpandedCard(opp.id);setActiveTab("results");}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                        <Badge color={urgencyColor(opp.urgency)}>{opp.urgency}</Badge>
                        <Badge color={tierColor(opp.strategicImportance||"TIER_2")}>{opp.strategicImportance||"TIER_2"}</Badge>
                        <span style={{fontSize:11}}>{verticalIcon(opp.vertical)}</span>
                        {opp.recompete && <Badge color={BLUE}>RECOMPETE</Badge>}
                      </div>
                      <div style={{color:TEXT,fontWeight:700,fontSize:13,marginBottom:2}}>{opp.title}</div>
                      <div style={{color:TEXT_D,fontSize:11}}>{opp.agency} · {opp.state} · {opp.estimatedValue}</div>
                      <div style={{color:TEXT_D,fontSize:11,marginTop:2}}>{opp.timing}</div>
                      {opp.description && <div style={{color:TEXT_D,fontSize:11,marginTop:4,fontStyle:"italic"}}>{opp.description}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:28,fontWeight:800,color:opiColor(opp.opiScore||0)}}>{opp.opiScore||"?"}</div>
                      <div style={{fontSize:9,color:TEXT_D,letterSpacing:"0.06em"}}>OPI SCORE</div>
                      <div style={{display:"flex",gap:6,marginTop:6,justifyContent:"flex-end",flexWrap:"wrap"}}>
                        <Btn small onClick={(e)=>{e.stopPropagation();sendToWorkflow(opp);}} disabled={sendingToWorkflow===opp.id}>
                          {sendingToWorkflow===opp.id?"Sending...":"→ Workflow"}
                        </Btn>
                        {opp.sourceUrl && (
                          <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                            style={{padding:"4px 10px",borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+"22",color:BLUE,border:`1px solid ${BLUE}44`,textDecoration:"none"}}
                            onClick={e=>e.stopPropagation()}>?</a>
                        )}
                        {!opp.savedToTracker && <Btn small variant="ghost" onClick={(e)=>{e.stopPropagation();saveToTracker(opp);}}>+ Track</Btn>}
                        {opp.savedToTracker && <Badge color={GREEN}>Tracked</Badge>}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              <Btn variant="ghost" small onClick={()=>setActiveTab("results")}>View All {huntResults.length} Results →</Btn>
            </div>
          )}
        </div>
      )}

      {/* ── RESULTS ── */}
      {activeTab === "results" && (
        <div>
          {/* Filters */}
          <Card style={{marginBottom:14}}>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <div>
                <Label text="VERTICAL" />
                <select value={filterVertical} onChange={e=>setFilterVertical(e.target.value)} style={{background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px",fontFamily:"inherit"}}>
                  <option value="all">All Verticals</option>
                  {VERTICALS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <Label text="STATE" />
                <select value={filterState} onChange={e=>setFilterState(e.target.value)} style={{background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px",fontFamily:"inherit"}}>
                  <option value="all">All States</option>
                  {["LA","TX","FL","MS","AL","GA","Federal"].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label text="SORT BY" />
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px",fontFamily:"inherit"}}>
                  <option value="opi">OPI Score</option>
                  <option value="urgency">Urgency</option>
                  <option value="value">Contract Value</option>
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:14}}>
                <input type="checkbox" checked={filterUrgent} onChange={e=>setFilterUrgent(e.target.checked)} id="urgentOnly" />
                <label htmlFor="urgentOnly" style={{fontSize:12,color:RED,cursor:"pointer"}}>Immediate Only</label>
              </div>
              <div style={{marginLeft:"auto",color:TEXT_D,fontSize:12,marginTop:14}}>{filtered.length} of {huntResults.length} shown</div>
            </div>
          </Card>

          {filtered.length === 0 && (
            <div style={{textAlign:"center",padding:40,color:TEXT_D}}>
              {huntResults.length === 0 ? "No results yet — go to Hunt Engine and click Hunt Now" : "No results match current filters"}
            </div>
          )}

          {filtered.map(opp => {
            const isExpanded = expandedCard === opp.id;
            return (
            <Card key={opp.id} style={{marginBottom:10,border:`1px solid ${isExpanded?GOLD:urgencyColor(opp.urgency)}33`,transition:"border 0.15s"}}>
              {/* Header row — always visible */}
              <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap",cursor:"pointer"}} onClick={()=>setExpandedCard(isExpanded?null:opp.id)}>
                <div style={{flex:1,minWidth:220}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                    <Badge color={urgencyColor(opp.urgency)}>{opp.urgency||"WATCH"}</Badge>
                    <Badge color={tierColor(opp.strategicImportance||"TIER_2")}>{opp.strategicImportance||"TIER_2"}</Badge>
                    <span style={{fontSize:12}}>{verticalIcon(opp.vertical)}</span>
                    <span style={{fontSize:11,color:TEXT_D}}>{VERTICALS.find(v=>v.id===opp.vertical)?.label||opp.vertical}</span>
                    {opp.recompete && <Badge color={BLUE}>RECOMPETE</Badge>}
                  </div>
                  <div style={{color:TEXT,fontWeight:700,fontSize:14,marginBottom:3}}>{opp.title}</div>
                  <div style={{color:TEXT_D,fontSize:12,marginBottom:2}}>
                    <strong style={{color:TEXT}}>{opp.agency}</strong> · {opp.state} · <span style={{color:GOLD}}>{opp.estimatedValue}</span>
                  </div>
                  <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>{opp.timing}</div>
                  {opp.description && <div style={{color:TEXT_D,fontSize:12,fontStyle:"italic"}}>{opp.description}</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:32,fontWeight:800,color:opiColor(opp.opiScore||0),marginBottom:2}}>{opp.opiScore||"?"}</div>
                  <div style={{fontSize:9,color:TEXT_D,letterSpacing:"0.06em",marginBottom:6}}>OPI SCORE</div>
                  <div style={{color:TEXT_D,fontSize:11}}>{isExpanded?"▲ Collapse":"▼ Details"}</div>
                </div>
              </div>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${BORDER}`}}>
                  {/* Scope of Work */}
                  {opp.scopeOfWork && (
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,color:GOLD,fontWeight:700,letterSpacing:"0.08em",marginBottom:6}}>SCOPE OF WORK</div>
                      {(Array.isArray(opp.scopeOfWork) ? opp.scopeOfWork : opp.scopeOfWork.split("\n").filter(Boolean)).map((s,i)=>(
                        <div key={i} style={{fontSize:12,color:TEXT_D,marginBottom:4,paddingLeft:12,borderLeft:`2px solid ${GOLD}44`}}>· {s.replace(/^[-•·]\s*/,"")}</div>
                      ))}
                    </div>
                  )}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                    {/* Why HGI Wins */}
                    {opp.whyHgiWins && (
                      <div>
                        <div style={{fontSize:11,color:GREEN,fontWeight:700,letterSpacing:"0.08em",marginBottom:6}}>WHY HGI WINS</div>
                        {(Array.isArray(opp.whyHgiWins)?opp.whyHgiWins:[opp.whyHgiWins]).map((w,i)=>(
                          <div key={i} style={{fontSize:12,color:TEXT_D,marginBottom:4}}>✓ {w}</div>
                        ))}
                      </div>
                    )}
                    {/* Key Requirements */}
                    {opp.keyRequirements && (
                      <div>
                        <div style={{fontSize:11,color:ORANGE,fontWeight:700,letterSpacing:"0.08em",marginBottom:6}}>KEY REQUIREMENTS</div>
                        <div style={{fontSize:12,color:TEXT_D}}>{opp.keyRequirements}</div>
                      </div>
                    )}
                  </div>

                  {/* Capture Action */}
                  {opp.captureAction && (
                    <div style={{marginBottom:12,padding:"8px 12px",background:GOLD+"11",border:`1px solid ${GOLD}33`,borderRadius:4}}>
                      <div style={{fontSize:11,color:GOLD,fontWeight:700,letterSpacing:"0.08em",marginBottom:4}}>⚡ THIS WEEK ACTION</div>
                      <div style={{fontSize:12,color:TEXT}}>{opp.captureAction}</div>
                    </div>
                  )}

                  {/* Incumbent */}
                  {opp.incumbent && (
                    <div style={{fontSize:12,color:TEXT_D,marginBottom:10}}>
                      Incumbent: <span style={{color:ORANGE,fontWeight:700}}>{opp.incumbent}</span>
                    </div>
                  )}

                  {/* Source + Link */}
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
                    <div style={{fontSize:11,color:TEXT_D}}>Source: <span style={{color:TEXT}}>{opp.source}</span></div>
                    {opp.sourceUrl && (
                      <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                        style={{padding:"4px 12px",borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+"22",color:BLUE,border:`1px solid ${BLUE}44`,textDecoration:"none",cursor:"pointer"}}
                        onClick={e=>e.stopPropagation()}>
                        ? Open Source →
                      </a>
                    )}
                    {/* SAM.gov search fallback */}
                    {!opp.sourceUrl && opp.source && opp.source.toLowerCase().includes("sam") && (
                      <a href={`https://sam.gov/search/?keywords=${encodeURIComponent(opp.title)}&index=opp`} target="_blank" rel="noopener noreferrer"
                        style={{padding:"4px 12px",borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+"22",color:BLUE,border:`1px solid ${BLUE}44`,textDecoration:"none"}}
                        onClick={e=>e.stopPropagation()}>
                        ? Search SAM.gov →
                      </a>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Btn small onClick={(e)=>{e.stopPropagation();sendToWorkflow(opp);}} disabled={sendingToWorkflow===opp.id}>
                      {sendingToWorkflow===opp.id?"⟳ Sending...":"⚡ Send to Full Workflow"}
                    </Btn>
                    {!opp.savedToTracker
                      ? <Btn small variant="ghost" onClick={(e)=>{e.stopPropagation();saveToTracker(opp);}}>+ Add to Tracker</Btn>
                      : <Badge color={GREEN}>✓ In Tracker</Badge>
                    }
                    <Btn small variant="secondary" onClick={(e)=>{e.stopPropagation();setExpandedCard(null);}}>Collapse</Btn>
                  </div>
                </div>
              )}

              {/* Collapsed action buttons */}
              {!isExpanded && (
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  <Btn small onClick={(e)=>{e.stopPropagation();sendToWorkflow(opp);}} disabled={sendingToWorkflow===opp.id}>
                    {sendingToWorkflow===opp.id?"⟳":"⚡"} Workflow
                  </Btn>
                  {!opp.savedToTracker
                    ? <Btn small variant="ghost" onClick={(e)=>{e.stopPropagation();saveToTracker(opp);}}>+ Track</Btn>
                    : <Badge color={GREEN}>✓ Tracked</Badge>
                  }
                  {opp.sourceUrl && (
                    <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                      style={{padding:"4px 10px",borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+"22",color:BLUE,border:`1px solid ${BLUE}44`,textDecoration:"none"}}
                      onClick={e=>e.stopPropagation()}>
                      ? Source
                    </a>
                  )}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* ── RETRIEVE DOCS ── */}
      {activeTab === "retrieve" && (
        <div>
          {/* URL Fetcher */}
          <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:14,marginBottom:4}}>? DOCUMENT RETRIEVAL ENGINE</div>
            <div style={{color:TEXT_D,fontSize:12,marginBottom:14}}>
              Paste any RFP URL — SAM.gov, LaPAC, Texas SmartBuy, agency website, or direct PDF link. 
              The system fetches the page, extracts all documents, analyzes the full scope, and sends it to Full Workflow ready for decomposition.
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input
                value={fetchUrl}
                onChange={e=>setFetchUrl(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&fetchRfp(fetchUrl)}
                placeholder="https://sam.gov/opp/... or https://lapac.doa.louisiana.gov/... or any RFP URL"
                style={{flex:1,background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,padding:"8px 12px",color:TEXT,fontSize:12,fontFamily:"inherit"}}
              />
              <Btn onClick={()=>fetchRfp(fetchUrl)} disabled={fetchLoading||!fetchUrl}>
                {fetchLoading ? "⟳ Retrieving..." : "? Retrieve"}
              </Btn>
            </div>
            <div style={{fontSize:11,color:TEXT_D}}>
              Works with: SAM.gov opportunities · LaPAC · Texas SmartBuy · Florida Vendor Directory · Agency websites · Direct PDF links · Any public procurement URL
            </div>

            {/* Loading state */}
            {fetchLoading && (
              <div style={{marginTop:12,padding:"10px 14px",background:BG3,borderRadius:4}}>
                <div style={{color:GOLD,fontSize:12,animation:"pulse 1.5s infinite"}}>
                  ⟳ Fetching page → Extracting documents → Analyzing with AI...
                </div>
              </div>
            )}

            {/* Error state */}
            {fetchError && (
              <div style={{marginTop:12,padding:"10px 14px",background:RED+"11",border:`1px solid ${RED}44`,borderRadius:4,color:RED,fontSize:12}}>
                ⚠ {fetchError} — Check the URL is publicly accessible and try again.
              </div>
            )}

            {/* Result preview */}
            {fetchResult?.analyzed && (
              <div style={{marginTop:14,padding:14,background:BG3,borderRadius:6,border:`1px solid ${GREEN}44`}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",marginBottom:10}}>
                  <div>
                    <div style={{color:GREEN,fontSize:11,fontWeight:700,marginBottom:4}}>✓ RETRIEVED & ANALYZED</div>
                    <div style={{color:TEXT,fontWeight:700,fontSize:14}}>{fetchResult.analyzed.title}</div>
                    <div style={{color:TEXT_D,fontSize:12}}>{fetchResult.analyzed.agency}</div>
                  </div>
                  <Badge color={fetchResult.analyzed.hgiRelevance==="HIGH"?GREEN:fetchResult.analyzed.hgiRelevance==="MEDIUM"?GOLD:TEXT_D}>
                    {fetchResult.analyzed.hgiRelevance||"?"} FIT
                  </Badge>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10,fontSize:11}}>
                  {fetchResult.analyzed.solicitationNumber && <div><span style={{color:TEXT_D}}>Solicitation: </span><span style={{color:GOLD}}>{fetchResult.analyzed.solicitationNumber}</span></div>}
                  {fetchResult.analyzed.dueDate && <div><span style={{color:TEXT_D}}>Due: </span><span style={{color:RED,fontWeight:700}}>{fetchResult.analyzed.dueDate}</span></div>}
                  {fetchResult.analyzed.estimatedValue && <div><span style={{color:TEXT_D}}>Value: </span><span style={{color:GREEN}}>{fetchResult.analyzed.estimatedValue}</span></div>}
                  {fetchResult.analyzed.naics && <div><span style={{color:TEXT_D}}>NAICS: </span><span style={{color:TEXT}}>{fetchResult.analyzed.naics}</span></div>}
                  {fetchResult.analyzed.setAside && <div><span style={{color:TEXT_D}}>Set-Aside: </span><span style={{color:TEXT}}>{fetchResult.analyzed.setAside}</span></div>}
                </div>

                {fetchResult.analyzed.description && (
                  <div style={{fontSize:12,color:TEXT_D,marginBottom:10,fontStyle:"italic"}}>{fetchResult.analyzed.description}</div>
                )}

                {fetchResult.analyzed.hgiFit && (
                  <div style={{fontSize:12,color:GREEN,marginBottom:10}}>✓ {fetchResult.analyzed.hgiFit}</div>
                )}

                {/* Document links found */}
                {fetchResult.analyzed.documentLinks?.length > 0 && (
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,color:TEXT_D,fontWeight:700,marginBottom:6}}>DOCUMENTS FOUND ({fetchResult.analyzed.documentLinks.length})</div>
                    {fetchResult.analyzed.documentLinks.slice(0,6).map((d,i)=>(
                      <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:10,color:GOLD}}>?</span>
                        <span style={{fontSize:11,color:TEXT_D,flex:1}}>{d.name}</span>
                        <a href={d.url} target="_blank" rel="noopener noreferrer"
                          style={{fontSize:10,color:BLUE,textDecoration:"none",padding:"2px 8px",border:`1px solid ${BLUE}44`,borderRadius:3}}>
                          Open →
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {fetchResult.analyzed.immediateAction && (
                  <div style={{padding:"8px 12px",background:GOLD+"11",border:`1px solid ${GOLD}33`,borderRadius:4,fontSize:12,color:TEXT,marginBottom:10}}>
                    <strong style={{color:GOLD}}>⚡ Action: </strong>{fetchResult.analyzed.immediateAction}
                  </div>
                )}

                <Btn onClick={()=>sendDocToWorkflow(fetchResult.analyzed)}>
                  ⚡ Send to Full Workflow →
                </Btn>
              </div>
            )}
          </Card>

          {/* Quick-fetch from hunt results */}
          {huntResults.filter(o=>o.sourceUrl).length > 0 && (
            <Card style={{marginBottom:16}}>
              <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:10}}>
                FETCH FROM HUNT RESULTS
              </div>
              <div style={{color:TEXT_D,fontSize:12,marginBottom:12}}>
                Click Retrieve on any hunted opportunity to fetch the actual RFP documents directly.
              </div>
              {huntResults.filter(o=>o.sourceUrl).slice(0,10).map(opp=>(
                <div key={opp.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${BORDER}`,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{color:TEXT,fontSize:12,fontWeight:700}}>{opp.title}</div>
                    <div style={{color:TEXT_D,fontSize:11}}>{opp.agency} · {opp.state}</div>
                    <div style={{fontSize:10,color:TEXT_D,wordBreak:"break-all"}}>{opp.sourceUrl}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    {oppFetchStatus[opp.id] === "fetching" && <span style={{fontSize:11,color:GOLD,animation:"pulse 1s infinite"}}>⟳ Fetching...</span>}
                    {oppFetchStatus[opp.id] === "analyzing" && <span style={{fontSize:11,color:BLUE,animation:"pulse 1s infinite"}}>⟳ Analyzing...</span>}
                    {oppFetchStatus[opp.id] === "done" && <Badge color={GREEN}>✓ Retrieved</Badge>}
                    {oppFetchStatus[opp.id]?.startsWith("error") && <span style={{fontSize:10,color:RED}}>⚠ Failed</span>}
                    {opp.documentsRetrieved && <Badge color={GREEN}>✓ Done</Badge>}
                    {!opp.documentsRetrieved && oppFetchStatus[opp.id] !== "done" && (
                      <Btn small onClick={()=>fetchRfp(opp.sourceUrl, opp.id)}
                        disabled={oppFetchStatus[opp.id]==="fetching"||oppFetchStatus[opp.id]==="analyzing"}>
                        ? Retrieve
                      </Btn>
                    )}
                    <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:11,color:BLUE,textDecoration:"none",padding:"4px 8px",border:`1px solid ${BLUE}44`,borderRadius:3}}>
                      ?
                    </a>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Retrieved Docs Library */}
          {retrievedDocs.length > 0 && (
            <Card>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{color:GOLD,fontWeight:700,fontSize:13}}>RETRIEVED DOCUMENTS LIBRARY ({retrievedDocs.length})</div>
                <Btn small variant="ghost" onClick={()=>{setRetrievedDocs([]);store.set("retrievedDocs",[]);}}>Clear All</Btn>
              </div>
              {retrievedDocs.map(doc=>(
                <div key={doc.id} style={{padding:"12px 0",borderBottom:`1px solid ${BORDER}`}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                        <Badge color={doc.hgiRelevance==="HIGH"?GREEN:doc.hgiRelevance==="MEDIUM"?GOLD:TEXT_D}>{doc.hgiRelevance||"?"} FIT</Badge>
                        {doc.solicitationNumber && <span style={{fontSize:11,color:TEXT_D}}>#{doc.solicitationNumber}</span>}
                        {doc.dueDate && <span style={{fontSize:11,color:RED,fontWeight:700}}>Due: {doc.dueDate}</span>}
                      </div>
                      <div style={{color:TEXT,fontWeight:700,fontSize:13,marginBottom:2}}>{doc.title||"Untitled"}</div>
                      <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>{doc.agency} · {doc.estimatedValue}</div>
                      {doc.description && <div style={{color:TEXT_D,fontSize:11,fontStyle:"italic",marginBottom:4}}>{doc.description}</div>}
                      {doc.documentLinks?.length > 0 && (
                        <div style={{fontSize:11,color:TEXT_D}}>
                          {doc.documentLinks.length} document{doc.documentLinks.length>1?"s":""} found ·
                          {doc.documentLinks.slice(0,3).map((d,i)=>(
                            <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                              style={{color:BLUE,marginLeft:6,textDecoration:"none"}}>? {d.name}</a>
                          ))}
                        </div>
                      )}
                      <div style={{fontSize:10,color:TEXT_D,marginTop:4}}>
                        Retrieved {new Date(doc.retrievedAt).toLocaleDateString()} · <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" style={{color:TEXT_D}}>{doc.sourceUrl?.slice(0,60)}...</a>
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                      <Btn small onClick={()=>sendDocToWorkflow(doc)}>⚡ Workflow</Btn>
                      <Btn small variant="ghost" onClick={()=>setRetrievedDocs(prev=>{const u=prev.filter(d=>d.id!==doc.id);store.set("retrievedDocs",u);return u;})}>Remove</Btn>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── SIGNALS ── */}
      {activeTab === "signals" && (
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card style={{border:`1px solid ${RED}44`}}>
              <div style={{color:RED,fontWeight:700,fontSize:13,marginBottom:10}}>⚡ DISASTER SIGNALS</div>
              <div style={{color:TEXT_D,fontSize:11,marginBottom:12}}>Recent declarations and events that will trigger FEMA PA / CDBG-DR RFP waves</div>
              {disasterAlerts.length === 0 && <div style={{color:TEXT_D,fontSize:12}}>Run Hunt to generate signals</div>}
              {disasterAlerts.map((a,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12}}>
                  <div style={{color:TEXT,fontWeight:700,marginBottom:2}}>{typeof a === "string" ? a : a.event || a.title || JSON.stringify(a)}</div>
                  {typeof a === "object" && a.implication && <div style={{color:TEXT_D,fontSize:11}}>{a.implication}</div>}
                  {typeof a === "object" && a.timing && <div style={{color:GOLD,fontSize:11}}>Expected RFPs: {a.timing}</div>}
                </div>
              ))}
            </Card>
            <Card style={{border:`1px solid ${GOLD}44`}}>
              <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:10}}>? FUNDING SIGNALS</div>
              <div style={{color:TEXT_D,fontSize:11,marginBottom:12}}>HUD, FEMA, Treasury, USDA allocations that haven't produced RFPs yet — early warning</div>
              {fundingAlerts.length === 0 && <div style={{color:TEXT_D,fontSize:12}}>Run Hunt to generate signals</div>}
              {fundingAlerts.map((a,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${BORDER}`,fontSize:12}}>
                  <div style={{color:TEXT,fontWeight:700,marginBottom:2}}>{typeof a === "string" ? a : a.allocation || a.title || JSON.stringify(a)}</div>
                  {typeof a === "object" && a.amount && <div style={{color:GREEN,fontSize:11}}>{a.amount}</div>}
                  {typeof a === "object" && a.implication && <div style={{color:TEXT_D,fontSize:11}}>{a.implication}</div>}
                  {typeof a === "object" && a.expectedRfp && <div style={{color:GOLD,fontSize:11}}>Expected RFP: {a.expectedRfp}</div>}
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ── SOURCES & CONFIG ── */}
      {activeTab === "sources" && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>MONITORED SOURCES</div>
            {SOURCES.map(s=>(
              <div key={s.id} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${BORDER}`}}>
                <input type="checkbox" checked={huntConfig.sources.includes(s.id)}
                  onChange={e=>{const cur=huntConfig.sources;const next=e.target.checked?[...cur,s.id]:cur.filter(x=>x!==s.id);const nc={...huntConfig,sources:next};setHuntConfig(nc);store.set("huntConfig",nc);}} />
                <div style={{flex:1}}>
                  <div style={{color:TEXT,fontWeight:700,fontSize:12}}>{s.label}</div>
                  <div style={{color:TEXT_D,fontSize:11}}>{s.desc}</div>
                </div>
                <Badge color={GREEN}>Active</Badge>
              </div>
            ))}
          </Card>

          <Card style={{marginBottom:16}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>STATE AGENCY WATCH LIST</div>
            {Object.entries(STATE_AGENCIES).map(([state, agencies])=>(
              <div key={state} style={{marginBottom:12}}>
                <div style={{color:GOLD,fontSize:12,fontWeight:700,marginBottom:6}}>{state}</div>
                {agencies.map(a=>(
                  <div key={a} style={{fontSize:11,color:TEXT_D,padding:"2px 0",borderBottom:`1px solid ${BORDER}22`}}>· {a}</div>
                ))}
              </div>
            ))}
          </Card>

          <Card>
            <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>HUNT FREQUENCY</div>
            <div style={{color:TEXT_D,fontSize:12,marginBottom:8}}>
              The Hunt Engine uses Claude AI to generate a ranked opportunity list from all sources simultaneously.
              Click <strong style={{color:GOLD}}>Hunt Now</strong> each morning for fresh results.
            </div>
            <div style={{padding:"10px 12px",background:BG3,borderRadius:4,fontSize:11,color:TEXT_D}}>
              ? <strong style={{color:GOLD}}>Pro tip:</strong> Run Hunt Now first thing each morning. High-signal sources update daily — SAM.gov, LaPAC, Texas SmartBuy, insurance associations, municipal boards. Disaster and funding signals update continuously.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
