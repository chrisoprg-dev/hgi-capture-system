// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ setActive }) {
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' }));
  const [hthaCountdown, setHthaCountdown] = useState({ days: 0, hours: 0 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [pipelineStats, setPipelineStats] = useState({ total: 0, tier1: 0, pursuing: 0, proposal: 0, submitted: 0 });
  const [scraperStats, setScraperStats] = useState({ lastRun: null, batch: 0, totalBids: 0, totalSent: 0, totalFiltered: 0, totalExpired: 0, runs: [] });
  const [winAnalytics, setWinAnalytics] = useState(null);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit' }));
      
      // HTHA deadline: March 19, 2026 at 2:00 PM CST
      const hthaDeadline = new Date('2026-03-19T14:00:00-06:00');
      const timeDiff = hthaDeadline - now;
      
      if (timeDiff > 0) {
        const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setHthaCountdown({ days, hours });
      } else {
        setHthaCountdown({ days: 0, hours: 0 });
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/opportunities?select=opi_score,status,stage&limit=1000');
        if (res.ok) {
          const data = await res.json();
          const active = data.filter(o => o.status === 'active');
          setPipelineStats({
            total: active.length,
            tier1: active.filter(o => o.opi_score >= 70).length,
            pursuing: active.filter(o => o.stage === 'pursuing').length,
            proposal: active.filter(o => o.stage === 'proposal').length,
            submitted: active.filter(o => o.stage === 'submitted').length
          });
        }
      } catch (e) {
        console.warn('Failed to fetch pipeline stats:', e.message);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchScraperStats = async () => {
      try {
        const res = await fetch('/api/hunt-analytics');
        if (res.ok) {
          const data = await res.json();
          const runs = data.runs || data || [];
          if (runs.length > 0) {
            const last = runs[0];
            setScraperStats({
              lastRun: last.run_at,
              batch: last.opportunities_found || 0,
              runs: runs.slice(0, 5),
              totalSent: runs.reduce((s, r) => s + (r.opportunities_found || 0), 0)
            });
          }
        }
      } catch (e) {}
    };
    fetchScraperStats();
    const interval = setInterval(fetchScraperStats, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchWinAnalytics = async () => {
      try {
        const res = await fetch('/api/win-analytics');
        if (res.ok) {
          const data = await res.json();
          if (data && data.win_rate !== undefined) {
            setWinAnalytics(data);
          }
        }
      } catch(e) {}
    };
    fetchWinAnalytics();
  }, []);

  const tracker = store.get("tracker") || [];
  const t1 = tracker.filter(o => o.opiScore && parseInt(o.opiScore) >= 70);
  const pursuing = tracker.filter(o => o.stage === "pursuing");
  const proposal = tracker.filter(o => o.stage === "proposal");
  const submitted = tracker.filter(o => o.stage === "submitted");
  const recentOpps = tracker.slice(0,5);

  const statBox = (label, value, color, module) => (
    <div onClick={()=>setActive(module)} style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:isMobile ? 16 : 20,cursor:"pointer",minWidth:150}}>
      <div style={{fontSize:isMobile ? 24 : 28,fontWeight:800,color:color||GOLD,marginBottom:4}}>{value}</div>
      <div style={{fontSize:Math.max(11, 13),color:TEXT_D,letterSpacing:"0.08em"}}>{label}</div>
    </div>
  );

  const isUrgent = hthaCountdown.days < 3;
  const alertColor = isUrgent ? "#dc2626" : "#ea580c";
  const alertBg = isUrgent ? "#fef2f2" : "#fff7ed";

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{color:GOLD,margin:"0 0 4px",fontSize:isMobile ? 20 : 22,fontWeight:800}}>HGI Capture Dashboard</h2>
        <p style={{
          color:TEXT_D,
          margin:0,
          fontSize:Math.max(13, 13),
          lineHeight: isMobile ? 1.4 : 1.2,
          wordWrap: 'break-word'
        }}>
          Hammerman & Gainer LLC · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})} · {currentTime}
        </p>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: 20
      }}>
        {statBox("TOTAL TRACKED", pipelineStats.total, GOLD, "tracker")}
        {statBox("TIER 1 (OPI 70+)", pipelineStats.tier1, GREEN, "tracker")}
        {statBox("PURSUING", pipelineStats.pursuing, GOLD, "tracker")}
        {statBox("IN PROPOSAL", pipelineStats.proposal, ORANGE, "tracker")}
        {statBox("SUBMITTED", pipelineStats.submitted, BLUE, "tracker")}
      </div>
      <div style={{
        background: alertBg,
        border: `2px solid ${alertColor}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        textAlign: "center",
        width: isMobile ? "100%" : "auto"
      }}>
        <div style={{
          color: alertColor,
          fontSize: Math.max(14, isMobile ? 14 : 16),
          fontWeight: 800,
          letterSpacing: "0.05em",
          lineHeight: isMobile ? 1.3 : 1.2,
          wordWrap: 'break-word'
        }}>
          HTHA PROPOSAL DUE — {hthaCountdown.days} days, {hthaCountdown.hours} hours remaining — submit to procurement@hthousing.com
        </div>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16,
        marginBottom: 20
      }}>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:Math.max(13, 13),marginBottom:12}}>RECENT PIPELINE</div>
          {recentOpps.length ? recentOpps.map(o => {
            const stage = STAGES.find(s=>s.id===o.stage);
            return (
              <div key={o.id} onClick={()=>setActive("tracker")} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BORDER}`,cursor:"pointer"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:stage?stage.color:TEXT_D,flexShrink:0}} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:Math.max(12, 13),color:TEXT,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.title}</div>
                  <div style={{fontSize:Math.max(11, 13),color:TEXT_D}}>{o.agency}</div>
                </div>
                {o.opiScore && <OPIBadge score={o.opiScore} />}
              </div>
            );
          }) : <div style={{color:TEXT_D,fontSize:Math.max(13, 13),padding:"20px 0",textAlign:"center"}}>No opportunities yet</div>}
          <div style={{marginTop:12}}><Btn small variant="ghost" onClick={()=>setActive("tracker")}>View All →</Btn></div>
        </Card>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:Math.max(13, 13),marginBottom:12}}>QUICK ACTIONS</div>
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
                  <div style={{color:TEXT,fontWeight:600,fontSize:Math.max(13, 13)}}>{title}</div>
                  <div style={{color:TEXT_D,fontSize:Math.max(11, 13),lineHeight:1.3}}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 16,
        marginBottom: 20
      }}>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:Math.max(13,13),marginBottom:12}}>SCRAPER STATUS</div>
          <div style={{fontSize:12,color:TEXT_D,marginBottom:8}}>
            Central Bidding · Every 30 min · 479 Louisiana agencies
          </div>
          {scraperStats.lastRun ? (
            <div>
              <div style={{fontSize:11,color:GREEN,marginBottom:6}}>
                ✓ Last run: {new Date(scraperStats.lastRun).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
              </div>
              <div style={{fontSize:11,color:TEXT_D,marginBottom:4}}>
                Batch {scraperStats.batch} of 96 · {Math.round(scraperStats.batch/96*100)}% complete
              </div>
              <div style={{height:4,background:BG3,borderRadius:2,marginBottom:8}}>
                <div style={{height:'100%',width:(scraperStats.batch/96*100)+'%',background:GOLD,borderRadius:2}} />
              </div>
              <div style={{fontSize:11,color:TEXT_D}}>
                Total sent to pipeline: <span style={{color:GOLD,fontWeight:700}}>{scraperStats.totalSent}</span>
              </div>
            </div>
          ) : (
            <div style={{fontSize:12,color:TEXT_D}}>Waiting for first run...</div>
          )}
        </Card>
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:Math.max(13,13),marginBottom:12}}>WIN RATE ANALYTICS</div>
          {winAnalytics && winAnalytics.win_rate !== undefined ? (
            <div>
              <div style={{fontSize:28,fontWeight:800,color:GREEN,marginBottom:4}}>{Math.round(winAnalytics.win_rate)}%</div>
              <div style={{fontSize:10,color:TEXT_D,letterSpacing:'0.06em',marginBottom:8}}>OVERALL WIN RATE</div>
              <div style={{fontSize:11,color:TEXT_D,marginBottom:4}}>Avg OPI won: <span style={{color:GREEN,fontWeight:700}}>{winAnalytics.avg_opi_won}</span></div>
              <div style={{fontSize:11,color:TEXT_D,marginBottom:8}}>Avg OPI lost: <span style={{color:RED,fontWeight:700}}>{winAnalytics.avg_opi_lost}</span></div>
              <div style={{fontSize:10,color:winAnalytics.calibration_health&&winAnalytics.calibration_health.includes('GOOD')?GREEN:ORANGE}}>{winAnalytics.calibration_health}</div>
            </div>
          ) : (
            <div style={{fontSize:12,color:TEXT_D}}>No win/loss data yet — update opportunity stages to won or lost to calibrate.</div>
          )}
        </Card>
      </div>
      <Card style={{border:`1px solid ${GOLD}22`}}>
        <div style={{color:GOLD,fontWeight:700,fontSize:Math.max(13, 13),marginBottom:12}}>RECOMMENDED WORKFLOW</div>
        <div style={{
          display:"flex",
          gap:0,
          flexWrap:"wrap",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center"
        }}>
          {[["1","Find RFP","Scanner or upload"],["2","Full Workflow","Decompose → Score → Brief"],["3","Expand Sections","Proposal Engine"],["4","Track & Manage","Pipeline Tracker"],["5","Weekly Review","Leadership Digest"]].map(([num,title,sub],i,arr)=>(
            <div key={num} style={{
              display:"flex",
              alignItems:"center",
              flexDirection: isMobile ? "row" : "column"
            }}>
              <div style={{
                textAlign: isMobile ? "left" : "center",
                padding: isMobile ? "8px 16px" : "0 16px",
                display: isMobile ? "flex" : "block",
                alignItems: isMobile ? "center" : "unset",
                gap: isMobile ? 12 : 0
              }}>
                <div style={{width:32,height:32,borderRadius:"50%",background:GOLD,color:"#000",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",margin: isMobile ? "0" : "0 auto 6px",flexShrink:0}}>{num}</div>
                <div>
                  <div style={{color:TEXT,fontSize:Math.max(12, 13),fontWeight:600,marginBottom:2}}>{title}</div>
                  <div style={{color:TEXT_D,fontSize:Math.max(11, 13)}}>{sub}</div>
                </div>
              </div>
              {i < arr.length-1 && <div style={{color:GOLD,fontSize:18,opacity:0.4,margin: isMobile ? "8px 16px" : 0}}>{isMobile ? "↓" : "→"}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}