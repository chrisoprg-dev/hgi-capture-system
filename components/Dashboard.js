function Dashboard({ setActive }) {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  const [expanded, setExpanded] = useState({});
  const [threatLevel, setThreatLevel] = useState('ELEVATED');
  const [activeAlerts, setActiveAlerts] = useState([]);

  // Greeting based on time of day
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Fetch intelligence on mount and every 3 minutes
  useEffect(() => {
    const fetchIntel = async () => {
      try {
        const [intelRes, alertsRes] = await Promise.all([
          fetch('/api/intelligence'),
          fetch('/api/alerts')
        ]);
        
        if (intelRes.ok) {
          const data = await intelRes.json();
          setIntel(data);
          
          // Determine threat level based on critical actions
          const criticals = data.actions?.filter(a => a.urgency === 'critical') || [];
          if (criticals.length >= 3) setThreatLevel('CRITICAL');
          else if (criticals.length >= 1) setThreatLevel('HIGH');
          else setThreatLevel('ELEVATED');
        }
        
        if (alertsRes.ok) {
          const alerts = await alertsRes.json();
          setActiveAlerts(alerts.filter(a => a.active));
        }
      } catch(e) {
        console.warn('Intelligence fetch failed:', e);
      }
      setLoading(false);
    };
    fetchIntel();
    const interval = setInterval(fetchIntel, 180000); // 3 minutes
    return () => clearInterval(interval);
  }, []);

  // Clock updates every 30 seconds
  useEffect(() => {
    const i = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(i);
  }, []);

  const threatColors = {
    'LOW': GREEN,
    'ELEVATED': GOLD, 
    'HIGH': ORANGE,
    'CRITICAL': RED
  };

  const urgencyBorder = (u) => u === 'critical' ? RED : u === 'high' ? ORANGE : u === 'medium' ? GOLD : BORDER;
  const urgencyBg = (u) => u === 'critical' ? RED+'11' : u === 'high' ? ORANGE+'11' : u === 'medium' ? GOLD+'11' : BG2;

  const stats = intel?.pipeline_stats || {};
  const actions = intel?.actions || [];
  const critical = actions.filter(a => a.urgency === 'critical');
  const high = actions.filter(a => a.urgency === 'high');
  const medium = actions.filter(a => a.urgency === 'medium');

  const ThreatMeter = () => (
    <div style={{
      background: threatColors[threatLevel] + '11',
      border: `2px solid ${threatColors[threatLevel]}44`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 20,
      position: 'relative'
    }}>
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <div style={{
          width:48, height:48, borderRadius:'50%',
          background: threatColors[threatLevel],
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:20, animation: threatLevel === 'CRITICAL' ? 'pulse 1s infinite' : 'none'
        }}>
          {threatLevel === 'CRITICAL' ? '🚨' : threatLevel === 'HIGH' ? '⚠️' : '🟡'}
        </div>
        <div>
          <div style={{color: threatColors[threatLevel], fontWeight:800, fontSize:16, letterSpacing:'0.1em'}}>
            THREAT LEVEL: {threatLevel}
          </div>
          <div style={{color:TEXT_D, fontSize:12, marginTop:2}}>
            {threatLevel === 'CRITICAL' && 'Multiple critical actions require immediate attention'}
            {threatLevel === 'HIGH' && 'Critical deadline approaching - action required'}
            {threatLevel === 'ELEVATED' && 'Normal operational tempo with active monitoring'}
            {threatLevel === 'LOW' && 'All systems nominal - routine monitoring'}
          </div>
        </div>
        <div style={{marginLeft:'auto', color:TEXT_D, fontSize:11}}>
          LAST UPDATE: {currentTime}
        </div>
      </div>
    </div>
  );

  const ActionCard = ({ action, index }) => {
    const isExpanded = expanded[index];
    const timeToDeadline = action.deadline ? Math.ceil((new Date(action.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
    
    return (
      <div style={{
        background: urgencyBg(action.urgency),
        border: `1px solid ${urgencyBorder(action.urgency)}44`,
        borderLeft: `4px solid ${urgencyBorder(action.urgency)}`,
        borderRadius: 6,
        padding: '14px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        position: 'relative'
      }} onClick={() => setExpanded(e => ({...e, [index]: !e[index]}))}>
        
        {action.classified && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: RED, color: 'white', fontSize: 9,
            padding: '2px 6px', borderRadius: 3, fontWeight: 700
          }}>CLASSIFIED</div>
        )}
        
        <div style={{display:'flex', alignItems:'flex-start', gap:12}}>
          <span style={{fontSize:20, flexShrink:0}}>{action.icon}</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
              <span style={{fontWeight:700, color:TEXT, fontSize:14}}>{action.agency || action.title}</span>
              {action.opi && <OPIBadge score={action.opi} />}
              {timeToDeadline && (
                <Badge color={timeToDeadline <= 1 ? RED : timeToDeadline <= 3 ? ORANGE : GOLD}>
                  {timeToDeadline}d remaining
                </Badge>
              )}
              {action.funding_amount && (
                <Badge color={GREEN}>${(action.funding_amount / 1000000).toFixed(1)}M</Badge>
              )}
            </div>
            
            <div style={{color: urgencyBorder(action.urgency), fontWeight:600, fontSize:13, marginBottom:4}}>
              {action.headline}
            </div>
            
            {action.intelligence_summary && (
              <div style={{
                background: BG3, border: `1px solid ${BORDER}`,
                borderRadius: 4, padding: 10, marginBottom: 8,
                fontSize: 12, color: TEXT_D, lineHeight: 1.5
              }}>
                <strong>INTEL:</strong> {action.intelligence_summary}
              </div>
            )}
            
            {isExpanded && (
              <div>
                <div style={{color:TEXT_D, fontSize:12, marginBottom:10, lineHeight:1.6}}>
                  {action.detail}
                </div>
                
                {action.risk_assessment && (
                  <div style={{
                    border: `1px solid ${RED}44`, background: RED+'08',
                    borderRadius: 4, padding: 8, marginBottom: 8
                  }}>
                    <div style={{color:RED, fontSize:11, fontWeight:700, marginBottom:4}}>RISK ASSESSMENT</div>
                    <div style={{fontSize:11, color:TEXT_D}}>{action.risk_assessment}</div>
                  </div>
                )}
                
                {action.recommended_actions && (
                  <div style={{fontSize:11, color:TEXT_D, marginBottom:8}}>
                    <strong>RECOMMENDED ACTIONS:</strong>
                    <ul style={{margin:'4px 0', paddingLeft:16}}>
                      {action.recommended_actions.map((rec, i) => (
                        <li key={i} style={{marginBottom:2}}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div style={{flexShrink:0, display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end'}}>
            <Btn small onClick={(e) => { e.stopPropagation(); setActive(action.action_module || 'workflow'); }}
              style={{
                background: urgencyBorder(action.urgency)+'22',
                color: urgencyBorder(action.urgency),
                border:`1px solid ${urgencyBorder(action.urgency)}44`,
                whiteSpace:'nowrap'
              }}>
              {action.action_label || 'EXECUTE'} →
            </Btn>
            <span style={{color:TEXT_D, fontSize:10}}>{isExpanded ? '▲ COLLAPSE' : '▼ EXPAND'}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* CLASSIFICATION HEADER */}
      <div style={{
        background: RED+'11', border: `2px solid ${RED}44`,
        borderRadius: 6, padding: 12, marginBottom: 20,
        textAlign: 'center'
      }}>
        <div style={{color:RED, fontSize:13, fontWeight:800, letterSpacing:'0.2em'}}>
          🔒 CONFIDENTIAL - HGI INTELLIGENCE BRIEFING - AUTHORIZED PERSONNEL ONLY
        </div>
      </div>

      {/* OPERATIONAL HEADER */}
      <div style={{marginBottom:20}}>
        <div style={{display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap'}}>
          <h2 style={{color:GOLD, margin:0, fontSize:22, fontWeight:800}}>
            {getGreeting()}, Director Wells.
          </h2>
          <span style={{color:TEXT_D, fontSize:13}}>
            {new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})} · {currentTime} CST
          </span>
        </div>
        <div style={{color:TEXT_D, fontSize:12, marginTop:4}}>
          OPERATIONAL STATUS: ACTIVE CAPTURE MODE · SCRAPER: ONLINE · PIPELINE: MONITORED
        </div>
      </div>

      {/* THREAT LEVEL INDICATOR */}
      <ThreatMeter />

      {/* ACTIVE ALERTS TICKER */}
      {activeAlerts.length > 0 && (
        <div style={{
          background: RED+'22', border: `1px solid ${RED}44`,
          borderRadius: 6, padding: 12, marginBottom: 20,
          overflow: 'hidden'
        }}>
          <div style={{
            color: RED, fontSize: 12, fontWeight: 700,
            whiteSpace: 'nowrap',
            animation: 'scroll-left 30s linear infinite'
          }}>
            🚨 BREAKING: {activeAlerts.map(a => a.message).join(' • ')} 🚨
          </div>
        </div>
      )}

      {/* EXECUTIVE SUMMARY */}
      {loading ? (
        <Card style={{marginBottom:20, border:`2px solid ${GOLD}44`, padding:24}}>
          <div style={{color:GOLD, fontSize:13, animation:'pulse 1.2s infinite'}}>
            🔄 ANALYZING INTELLIGENCE STREAMS...
          </div>
        </Card>
      ) : intel?.executive_summary ? (
        <Card style={{marginBottom:20, background:GOLD+'11', border:`2px solid ${GOLD}44`}}>
          <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
            <span style={{fontSize:24}}>🎯</span>
            <div>
              <div style={{color:GOLD, fontSize:11, fontWeight:700, letterSpacing:'0.1em', marginBottom:6}}>
                EXECUTIVE INTELLIGENCE BRIEF
              </div>
              <div style={{color:TEXT, fontSize:14, lineHeight:1.7, fontWeight:500}}>
                {intel.executive_summary}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{marginBottom:20, border:`1px solid ${BORDER}`}}>
          <div style={{color:TEXT_D, fontSize:13}}>
            📊 All intelligence streams nominal. No immediate threats detected.
          </div>
        </Card>
      )}

      {/* OPERATIONAL METRICS */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px,1fr))', gap:10, marginBottom:20}}>
        {[
          ['ACTIVE TARGETS', stats.total_active || 0, GOLD, 'discovery'],
          ['HIGH VALUE', stats.tier1 || 0, GREEN, 'tracker'],
          ['IN PURSUIT', stats.pursuing || 0, ORANGE, 'tracker'],
          ['PROPOSALS OUT', stats.proposal || 0, BLUE, 'proposal'],
          ['AWAITING INTEL', stats.submitted || 0, PURPLE, 'tracker'],
          ['COMPROMISED', stats.stale || 0, RED, 'tracker'],
          ['NEW TARGETS', stats.new_today || 0, GREEN, 'discovery'],
          ['WIN RATE', intel?.win_rate ? `${intel.win_rate}%` : 'N/A', GREEN, 'analytics']
        ].map(([label, val, color, mod]) => (
          <div key={label} onClick={() => setActive(mod)} style={{
            background:BG2, border:`1px solid ${BORDER}`, borderBottom:`3px solid ${color}44`,
            borderRadius:6, padding:'12px 14px', cursor:'pointer', textAlign:'center'
          }}>
            <div style={{fontSize:22, fontWeight:800, color}}>{val}</div>
            <div style={{fontSize:9, color:TEXT_D, letterSpacing:'0.08em', marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>

      {/* HIGH PRIORITY INTEL */}
      {intel?.new_declarations?.length > 0 && (
        <Card style={{marginBottom:20, border:`2px solid ${RED}44`, background:RED+'08'}}>
          <div style={{color:RED, fontWeight:700, fontSize:13, marginBottom:10}}>
            🚨 FLASH TRAFFIC - NEW DISASTER DECLARATIONS - IMMEDIATE RESPONSE REQUIRED
          </div>
          {intel.new_declarations.map((d, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 0', borderBottom:`1px solid ${BORDER}`, flexWrap:'wrap', gap:8
            }}>
              <div>
                <div style={{color:TEXT, fontWeight:600, fontSize:13}}>{d.title}</div>
                <div style={{color:TEXT_D, fontSize:11}}>
                  {d.incident_type} · {d.state} · DECLARED: {new Date(d.date).toLocaleDateString()}
                </div>
              </div>
              <Btn small onClick={() => setActive('content')} 
                style={{background:RED+'22', color:RED, border:`1px solid ${RED}44`}}>
                DEPLOY 48HR RESPONSE →
              </Btn>
            </div>
          ))}
        </Card>
      )}

      {/* PRIORITY ACTION ITEMS */}
      {!loading && actions.length > 0 && (
        <div style={{marginBottom:20}}>
          {critical.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{
                color:RED, fontSize:11, fontWeight:700, letterSpacing:'0.1em', marginBottom:8,
                animation: 'pulse 2s infinite'
              }}>
                🔴 CRITICAL PRIORITY - DIRECTOR ATTENTION REQUIRED ({critical.length})
              </div>
              {critical.map((a, i) => <ActionCard key={i} action={a} index={'c'+i} />)}
            </div>
          )}
          
          {high.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{color:ORANGE, fontSize:11, fontWeight:700, letterSpacing:'0.1em', marginBottom:8}}>
                🟡 HIGH PRIORITY - ACTION REQUIRED TODAY ({high.length})
              </div>
              {high.map((a, i) => <ActionCard key={i} action={a} index={'h'+i} />)}
            </div>
          )}
          
          {medium.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{color:GOLD, fontSize:11, fontWeight:700, letterSpacing:'0.1em', marginBottom:8}}>
                🔵 MEDIUM PRIORITY - THIS WEEK ({medium.length})
              </div>
              {medium.map((a, i) => <ActionCard key={i} action={a} index={'m'+i} />)}
            </div>
          )}
        </div>
      )}

      {/* INTELLIGENCE OPERATIONS */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20}}>
        <Card>
          <div style={{color:GOLD, fontWeight:700, fontSize:13, marginBottom:10}}>COLLECTION STATUS</div>
          <div style={{fontSize:11, color:TEXT_D, marginBottom:6}}>
            SIGINT: Central Bidding · Every 6 min · 479 Louisiana agencies · Priority sorted
          </div>
          {stats.last_scraper_run ? (
            <div>
              <div style={{fontSize:11, color:GREEN, marginBottom:4}}>
                ✅ LAST COLLECTION: {new Date(stats.last_scraper_run).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              </div>
              <div style={{color:TEXT_D, fontSize:11, marginBottom:6}}>
                Signal strength: <span style={{color:GREEN}}>STRONG</span> · 
                New intel today: <span style={{color:GOLD, fontWeight:700}}>{stats.new_today || 0}</span>
              </div>
              <div style={{fontSize:10, color:TEXT_D}}>
                Next sweep in {6 - (Math.floor(Date.now() / 60000) % 6)} minutes
              </div>
            </div>
          ) : (
            <div style={{fontSize:11, color:ORANGE}}>⚠️ Collection system initializing...</div>
          )}
        </Card>

        <Card>
          <div style={{color:GOLD, fontWeight:700, fontSize:13, marginBottom:10}}>TACTICAL OPERATIONS</div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {[
              ['⚡', 'Process New Intel', 'workflow', RED],
              ['◎', 'Monitor Pipeline', 'discovery', GOLD],
              ['✦', 'Deploy Proposal', 'proposal', ORANGE],
              ['◇', 'Generate Brief', 'digest', BLUE],
              ['🎯', 'Target Analysis', 'scoring', GREEN]
            ].map(([icon, label, mod, color]) => (
              <div key={mod} onClick={() => setActive(mod)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                background:BG3, borderRadius:4, cursor:'pointer',
                border:`1px solid ${BORDER}`, borderLeft:`3px solid ${color}44`
              }}>
                <span style={{fontSize:14}}>{icon}</span>
                <span style={{color:TEXT_D, fontSize:12, flex:1}}>{label}</span>
                <span style={{color, fontSize:11, fontWeight:700}}>EXECUTE</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* OPERATIONAL DOCTRINE */}
      <Card style={{border:`1px solid ${GOLD}44`, background:BG3}}>
        <div style={{color:GOLD, fontSize:11, fontWeight:700, letterSpacing:'0.08em', marginBottom:8}}>
          HGI CAPTURE DOCTRINE - TACTICAL SEQUENCE
        </div>
        <div style={{display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
          {['DETECT','ASSESS','CLASSIFY','ANALYZE','STRATEGIZE','PROPOSE','DEPLOY','MONITOR','WIN'].map((step, i, arr) => (
            <React.Fragment key={step}>
              <div style={{
                padding:'4px 10px', borderRadius:3, background:BG2,
                border:`1px solid ${BORDER}`, fontSize:10, color:TEXT_D, fontWeight:600
              }}>
                {step}
              </div>
              {i < arr.length-1 && <span style={{color:GOLD, fontSize:12, fontWeight:800}}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <div style={{color:TEXT_D, fontSize:10, marginTop:8, lineHeight:1.4}}>
          Each target in the pipeline follows this tactical sequence. The AI briefing system provides 
          real-time intelligence on position, status, and recommended next actions for all active operations.
        </div>
      </Card>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes scroll-left {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}