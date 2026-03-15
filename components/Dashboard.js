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
    const borderColor = urgencyBorder(action.urgency);
    return (
      <div style={{
        background: urgencyBg(action.urgency),
        border: `1px solid ${borderColor}33`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 6,
        marginBottom: 10,
        overflow: 'hidden'
      }}>
        {/* COLLAPSED ROW — always visible */}
        <div style={{display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', cursor:'pointer'}}
          onClick={() => setExpanded(e => ({...e, [index]: !e[index]}))}>
          <span style={{fontSize:20, flexShrink:0, marginTop:2}}>{action.icon}</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
              <span style={{fontWeight:700, color:TEXT, fontSize:14}}>{action.title || action.agency}</span>
              {action.opi && <OPIBadge score={action.opi} />}
              {action.days_until_deadline && <Badge color={RED}>{action.days_until_deadline}d left</Badge>}
              {action.estimated_value && <span style={{color:GREEN, fontSize:11, fontWeight:600}}>{action.estimated_value}</span>}
              {action.recompete && <Badge color={BLUE}>RECOMPETE</Badge>}
            </div>
            <div style={{color:borderColor, fontWeight:600, fontSize:13}}>{action.headline}</div>
            {/* Intel headline — the single most important intel point */}
            {action.intel_headline && (
              <div style={{color:TEXT_D, fontSize:12, marginTop:4, fontStyle:'italic'}}>{action.intel_headline}</div>
            )}
          </div>
          <div style={{flexShrink:0, display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end'}}>
            <Btn small onClick={(e) => { e.stopPropagation(); setActive(action.action_module || 'workflow'); }}
              style={{background:borderColor+'22', color:borderColor, border:`1px solid ${borderColor}44`, whiteSpace:'nowrap'}}>
              {action.action_label || 'Take Action'} →
            </Btn>
            <span style={{color:TEXT_D, fontSize:10, cursor:'pointer'}}>{isExpanded ? '▲ hide intel' : '▼ full intel'}</span>
          </div>
        </div>

        {/* EXPANDED INTEL PACKAGE */}
        {isExpanded && (
          <div style={{borderTop:`1px solid ${borderColor}22`, background:BG3, padding:'14px 16px'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>

              {/* WHY HGI WINS */}
              {action.win_case && (
                <div>
                  <div style={{color:GREEN, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>WHY HGI WINS</div>
                  <div style={{color:TEXT_D, fontSize:12, lineHeight:1.6}}>{action.win_case}</div>
                  {Array.isArray(action.why_hgi_wins) && action.why_hgi_wins.length > 0 && (
                    <div style={{marginTop:8}}>
                      {action.why_hgi_wins.slice(0,3).map((w,i) => (
                        <div key={i} style={{fontSize:11, color:TEXT_D, marginBottom:3}}>✓ {w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* COMPETITIVE INTEL */}
              {action.competitor_intel && (
                <div>
                  <div style={{color:ORANGE, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>COMPETITIVE INTEL</div>
                  <div style={{color:TEXT_D, fontSize:12, lineHeight:1.6}}>{action.competitor_intel}</div>
                  {action.incumbent && action.incumbent !== '' && (
                    <div style={{marginTop:6, fontSize:11, color:ORANGE}}>Incumbent: <strong>{action.incumbent}</strong></div>
                  )}
                </div>
              )}

              {/* RISK */}
              {action.risk && (
                <div>
                  <div style={{color:RED, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>KEY RISK</div>
                  <div style={{color:TEXT_D, fontSize:12, lineHeight:1.6}}>{action.risk}</div>
                </div>
              )}

              {/* SCOPE */}
              {Array.isArray(action.scope_of_work) && action.scope_of_work.length > 0 && (
                <div>
                  <div style={{color:BLUE, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>SCOPE</div>
                  {action.scope_of_work.slice(0,3).map((s,i) => (
                    <div key={i} style={{fontSize:11, color:TEXT_D, marginBottom:3}}>· {s}</div>
                  ))}
                </div>
              )}
            </div>

            {/* HGI FIT */}
            {action.hgi_fit && (
              <div style={{padding:'8px 12px', background:GREEN+'11', border:`1px solid ${GREEN}22`, borderRadius:4, marginBottom:12, fontSize:12, color:TEXT}}>
                <strong style={{color:GREEN}}>HGI FIT: </strong>{action.hgi_fit}
              </div>
            )}

            {/* THIS WEEK ACTION — the most directive element */}
            {action.this_week_action && (
              <div style={{padding:'10px 14px', background:borderColor+'11', border:`1px solid ${borderColor}33`, borderRadius:4, marginBottom:12}}>
                <div style={{color:borderColor, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:4}}>⚡ THIS WEEK — DO THIS</div>
                <div style={{color:TEXT, fontSize:13, fontWeight:600, lineHeight:1.5}}>{action.this_week_action}</div>
              </div>
            )}

            {/* KEY REQUIREMENTS */}
            {Array.isArray(action.key_requirements) && action.key_requirements.length > 0 && (
              <div style={{marginBottom:12}}>
                <div style={{color:TEXT_D, fontSize:10, fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>KEY REQUIREMENTS</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {action.key_requirements.map((r,i) => (
                    <Badge key={i} color={TEXT_D}>{r}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* SOURCE LINK + ACTION BUTTONS */}
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <Btn small onClick={() => setActive(action.action_module || 'workflow')}
                style={{background:borderColor+'22', color:borderColor, border:`1px solid ${borderColor}44`}}>
                {action.action_label || 'Take Action'} →
              </Btn>
              {action.source_url && (
                <a href={action.source_url} target="_blank" rel="noopener noreferrer"
                  style={{padding:'5px 12px', borderRadius:4, fontSize:11, fontWeight:700, background:BLUE+'22', color:BLUE, border:`1px solid ${BLUE}44`, textDecoration:'none'}}>
                  View Source →
                </a>
              )}
              <span style={{color:TEXT_D, fontSize:11, marginLeft:'auto'}}>{action.agency}</span>
            </div>
          </div>
        )}
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

      {/* MARKET PULSE */}
      {intel?.market_pulse && (
        <Card style={{marginBottom:20, border:`1px solid ${GOLD}22`, background:BG3}}>
          <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
            <span style={{fontSize:20}}>📡</span>
            <div>
              <div style={{color:GOLD, fontSize:10, fontWeight:700, letterSpacing:'0.1em', marginBottom:6}}>MARKET PULSE — THIS WEEK</div>
              <div style={{color:TEXT_D, fontSize:13, lineHeight:1.7}}>{intel.market_pulse}</div>
            </div>
          </div>
        </Card>
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