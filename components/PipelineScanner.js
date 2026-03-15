// ── PIPELINE SCANNER ──────────────────────────────────────────────────────────
function PipelineScanner() {
  const [opps, setOpps] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState("");
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState({});
  const [lastScanned, setLastScanned] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = store.get("scanner");
    if (d) { setOpps(d.opps || []); setLastScanned(d.at); }
  }, []);

  const scan = async () => {
    setScanning(true); setError(''); setOpps([]);
    try {
      const res = await fetch('/api/opportunities?status=active&limit=50');
      if (res.ok) {
        const data = await res.json();
        const at = new Date().toISOString();
        setOpps(data);
        setLastScanned(at);
        store.set('scanner', { opps: data, at });
        if (!data.length) setError('No active opportunities in pipeline yet. The scraper runs every 30 minutes.');
      } else {
        setError('Failed to load pipeline data.');
      }
    } catch(ex) {
      setError('Error loading pipeline: ' + ex.message);
    }
    setProgress(''); setScanning(false);
  };

  const analyze = async (opp) => {
    setAnalyzing(a => ({...a, [opp.id]: true}));
    const txt = await callClaude("Analyze for HGI:\nTitle: " + opp.title + "\nAgency: " + opp.agency + "\nValue: " + opp.value + "\nDue: " + opp.deadline + "\n\n1) HGI fit 1-10\n2) Win themes\n3) Key risks\n4) BID/NO-BID\n5) Next action");
    setAnalysis(a => ({...a, [opp.id]: txt}));
    setAnalyzing(a => ({...a, [opp.id]: false}));
  };

  const addTracker = (opp) => {
    const ex = store.get("tracker") || [];
    if (ex.find(o => o.id === opp.id)) { alert("Already in tracker."); return; }
    store.set("tracker", [{
      ...opp, title: opp.title || "Untitled", agency: opp.agency || "",
      value: opp.value || "", deadline: opp.deadline || "", type: opp.cat || "",
      stage: "identified", notes: opp.description || "", addedDate: new Date().toISOString()
    }, ...ex]);
    alert("Added to Pipeline Tracker!");
  };

  const getUrgencyColor = (urgency) => {
    switch(urgency) {
      case 'IMMEDIATE': return RED;
      case 'CRITICAL': return '#FF7F00';
      case 'URGENT': return '#FFD700';
      case 'APPROACHING': return '#4A90E2';
      default: return TEXT_D;
    }
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <div>
          <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Live Pipeline Scanner</h2>
          <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>SAM.gov · LaPAC · Texas SmartBuy · Gulf Coast portals</p>
          {lastScanned && <p style={{color:TEXT_D,fontSize:11,margin:"2px 0 0"}}>Last scan: {new Date(lastScanned).toLocaleString()} · {opps.length} found</p>}
        </div>
        <Btn onClick={scan} disabled={scanning} style={{marginLeft:"auto"}}>{scanning ? "Scanning..." : "Run Live Scan"}</Btn>
      </div>
      {scanning && <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
        <div style={{color:GOLD,fontWeight:700,marginBottom:6,animation:"pulse 1.2s infinite"}}>Scanning procurement portals...</div>
        <div style={{color:TEXT_D,fontSize:12}}>{progress}</div>
      </Card>}
      {error && <Card style={{marginBottom:16,border:`1px solid ${RED}44`}}><div style={{color:RED,fontSize:13}}>{error}</div></Card>}
      {!scanning && !opps.length && !error && <Card style={{textAlign:"center",padding:48,border:`1px dashed ${BORDER}`}}>
        <div style={{fontSize:40,marginBottom:12}}>◎</div>
        <Btn onClick={scan}>Run First Scan</Btn>
      </Card>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {opps.map(opp => (
          <Card key={opp.id} style={{borderLeft:`3px solid ${GOLD}`}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <div style={{fontWeight:700,color:TEXT,fontSize:14}}>{opp.title}</div>
                  {opp.opi_score && <OPIBadge score={opp.opi_score} />}
                  {opp.urgency && <span style={{
                    background:getUrgencyColor(opp.urgency),
                    color:'white',
                    padding:'2px 6px',
                    borderRadius:4,
                    fontSize:10,
                    fontWeight:600
                  }}>{opp.urgency}</span>}
                  {opp.vertical && <span style={{
                    background:BG3,
                    color:TEXT_D,
                    padding:'2px 6px',
                    borderRadius:4,
                    fontSize:10,
                    border:`1px solid ${BORDER}`
                  }}>{opp.vertical}</span>}
                </div>
                {opp.description && <div style={{color:TEXT_D,fontSize:12,marginBottom:6}}>{opp.description}</div>}
                {opp.capture_action && <div style={{
                  background:`${GOLD}22`,
                  color:GOLD,
                  padding:'6px 8px',
                  borderRadius:4,
                  fontSize:12,
                  marginBottom:6,
                  border:`1px solid ${GOLD}44`
                }}><strong>Action:</strong> {opp.capture_action}</div>}
                <div style={{display:"flex",gap:16,fontSize:12,flexWrap:"wrap"}}>
                  {opp.agency && <span><span style={{color:GOLD}}>Agency:</span> {opp.agency}</span>}
                  {opp.value && <span><span style={{color:GOLD}}>Value:</span> {opp.value}</span>}
                  {opp.deadline && <span><span style={{color:GOLD}}>Due:</span> {opp.deadline}</span>}
                  {opp.days_until_deadline !== null && opp.days_until_deadline !== undefined && 
                    <span style={{color:opp.days_until_deadline < 7 ? RED : TEXT_D}}>
                      {opp.days_until_deadline} days left
                    </span>}
                  {opp.url && <a href={opp.url} target="_blank" rel="noopener noreferrer" style={{color:GOLD}}>View RFP</a>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <Btn small onClick={()=>analyze(opp)} disabled={analyzing[opp.id]}>{analyzing[opp.id]?"...":"Analyze"}</Btn>
                <Btn small variant="secondary" onClick={()=>addTracker(opp)}>+ Track</Btn>
              </div>
            </div>
            {(analyzing[opp.id] || analysis[opp.id]) && <div style={{marginTop:12}}><AIOut content={analysis[opp.id]} loading={analyzing[opp.id]} /></div>}
          </Card>
        ))}
      </div>
      <Card style={{marginTop:20,background:BG3}}>
        <div style={{color:GOLD_D,fontSize:11,fontWeight:700,letterSpacing:"0.08em",marginBottom:10}}>MANUAL PORTALS</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[["SAM.gov","https://sam.gov/search/?index=opp&keywords=disaster+recovery+program+management"],
            ["LaPAC","https://wwwcfprd.doa.louisiana.gov/lapac/bidSelect.cfm"],
            ["Texas SmartBuy","https://www.txsmartbuy.gov/sp"],
            ["FEMA Procurement","https://www.fema.gov/about/procurement"],
            ["HUD CDBG-DR","https://www.hud.gov/program_offices/comm_planning/cdbg-dr"]
          ].map(([label,url]) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              style={{color:GOLD,fontSize:12,textDecoration:"none",padding:"4px 10px",border:`1px solid ${GOLD}44`,borderRadius:4}}>{label}</a>
          ))}
        </div>
      </Card>
    </div>
  );
}