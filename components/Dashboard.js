// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ setActive }) {
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' }));
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' }));
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const tracker = store.get("tracker") || [];
  const t1 = tracker.filter(o => o.opiScore && parseInt(o.opiScore) >= 70);
  const pursuing = tracker.filter(o => o.stage === "pursuing");
  const proposal = tracker.filter(o => o.stage === "proposal");
  const submitted = tracker.filter(o => o.stage === "submitted");
  const recentOpps = tracker.slice(0,5);

  const statBox = (label, value, color, module) => (
    <div onClick={()=>setActive(module)} style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:20,cursor:"pointer",flex:1,minWidth:140}}>
      <div style={{fontSize:28,fontWeight:800,color:color||GOLD,marginBottom:4}}>{value}</div>
      <div style={{fontSize:11,color:TEXT_D,letterSpacing:"0.08em"}}>{label}</div>
    </div>
  );

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:22,fontWeight:800}}>HGI Capture Dashboard</h2>
        <p style={{color:TEXT_D,margin:0,fontSize:13}}>Hammerman & Gainer LLC · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})} · {currentTime}</p>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {statBox("TOTAL TRACKED", tracker.length, GOLD, "tracker")}
        {statBox("TIER 1 (OPI 70+)", t1.length, GREEN, "tracker")}
        {statBox("PURSUING", pursuing.length, GOLD, "tracker")}
        {statBox("IN PROPOSAL", proposal.length, ORANGE, "tracker")}
        {statBox("SUBMITTED", submitted.length, BLUE, "tracker")}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>RECENT PIPELINE</div>
          {recentOpps.length ? recentOpps.map(o => {
            const stage = STAGES.find(s=>s.id===o.stage);
            return (
              <div key={o.id} onClick={()=>setActive("tracker")} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BORDER}`,cursor:"pointer"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:stage?stage.color:TEXT_D,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:TEXT,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.title}</div>
                  <div style={{fontSize:11,color:TEXT_D}}>{o.agency}</div>
                </div>
                {o.opiScore && <OPIBadge score={o.opiScore} />}
              </div>
            );
          }) : <div style={{color:TEXT_D,fontSize:13,padding:"20px 0",textAlign:"center"}}>No opportunities yet</div>}
          <div style={{marginTop:12}}><Btn small variant="ghost" onClick={()=>setActive("tracker")}>View All →</Btn></div>
        </Card>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>QUICK ACTIONS</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              ["workflow","⚡","Run Full Workflow","Upload RFP → Decompose → Score → Propose"],
              ["scanner","◎","Scan for New RFPs","Search SAM.gov, LaPAC, Gulf Coast portals"],
              ["scoring","◆","Score an Opportunity","Quick Pwin + OPI before committing resources"],
              ["digest","◇","Generate Weekly Digest","AI capture intelligence brief for leadership"],
            ].map(([mod,icon,title,sub])=>(
              <div key={mod} onClick={()=>setActive(mod)} style={{display:"flex",alignItems:"center",gap:12,padding:12,background:BG3,borderRadius:4,cursor:"pointer",border:`1px solid ${BORDER}`}}>
                <span style={{fontSize:18}}>{icon}</span>
                <div>
                  <div style={{color:TEXT,fontWeight:600,fontSize:13}}>{title}</div>
                  <div style={{color:TEXT_D,fontSize:11}}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card style={{border:`1px solid ${GOLD}22`}}>
        <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>RECOMMENDED WORKFLOW</div>
        <div style={{display:"flex",gap:0,flexWrap:"wrap"}}>
          {[["1","Find RFP","Scanner or upload"],["2","Full Workflow","Decompose → Score → Brief"],["3","Expand Sections","Proposal Engine"],["4","Track & Manage","Pipeline Tracker"],["5","Weekly Review","Leadership Digest"]].map(([num,title,sub],i,arr)=>(
            <div key={num} style={{display:"flex",alignItems:"center"}}>
              <div style={{textAlign:"center",padding:"0 16px"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:GOLD,color:"#000",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px"}}>{num}</div>
                <div style={{color:TEXT,fontSize:12,fontWeight:600,marginBottom:2}}>{title}</div>
                <div style={{color:TEXT_D,fontSize:11}}>{sub}</div>
              </div>
              {i < arr.length-1 && <div style={{color:GOLD,fontSize:18,opacity:0.4}}>→</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}