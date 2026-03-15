function OpportunityBrief() {
  const [opps, setOpps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [researchResult, setResearchResult] = useState('');
  const [scoringResult, setScoringResult] = useState('');
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchestrateResult, setOrchestrateResult] = useState(null);
  const [scopeAnalysis, setScopeAnalysis] = useState('');
  const [analyzingScope, setAnalyzingScope] = useState(false);
  const [fetchingSource, setFetchingSource] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/opportunities?sort=opi_score.desc&limit=20');
        const d = await r.json();
        const list = (d.opportunities || d || []).filter(o => o.status === 'active');
        setOpps(list);
        if (list.length > 0) setSelected(list[0]);
      } catch(e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const daysLeft = (due) => {
    if (!due) return null;
    try {
      const d = new Date(due);
      if (isNaN(d)) return null;
      return Math.ceil((d - new Date()) / 86400000);
    } catch(e) { return null; }
  };

  const runResearch = async () => {
    if (!selected) return;
    setResearching(true);
    setResearchResult('');
    const kb = await queryKB(selected.vertical || 'disaster');
    const txt = await callClaude(
      'Full capture intelligence brief for HGI on this opportunity:\n\nTitle: ' + selected.title +
      '\nAgency: ' + selected.agency +
      '\nVertical: ' + (selected.vertical || 'general') +
      '\nOPI: ' + selected.opi_score +
      '\nDescription: ' + (selected.description || '').slice(0, 1500) +
      '\nScope: ' + (selected.scope_of_work || []).join('; ') +
      '\nWhy HGI Wins: ' + (selected.why_hgi_wins || []).join('; ') +
      '\nDue: ' + (selected.due_date || 'TBD') +
      '\n\nHGI KB:\n' + (kb || '').slice(0, 2000) +
      '\n\nProvide:\n1. AGENCY PROFILE — 3 sentences\n2. DECISION-MAKER INTEL — who to contact\n3. COMPETITIVE LANDSCAPE — name real competitors (ICF, Hagerty, Witt, Dewberry, CDM Smith, APTIM, Gallagher, Marsh)\n4. HGI WIN STRATEGY — 3 specific differentiators with past performance proof\n5. RED FLAGS — risks and obstacles\n6. 48-HOUR ACTION PLAN — exactly what to do right now\n7. RELATIONSHIP GAPS — what relationships are missing',
      'You are HGI senior capture intelligence analyst. Be specific. Name real firms. Use real HGI past performance.', 3000
    );
    setResearchResult(txt);
    setResearching(false);
  };

  const runWinnability = async () => {
    if (!selected) return;
    setScoring(true);
    setScoringResult('');
    const kb = await queryKB(selected.vertical || 'disaster');
    const txt = await callClaude(
      'Winnability assessment for HGI:\n\nTitle: ' + selected.title +
      '\nAgency: ' + selected.agency +
      '\nOPI: ' + selected.opi_score +
      '\nDescription: ' + (selected.description || '').slice(0, 1000) +
      '\nWhy HGI Wins: ' + (selected.why_hgi_wins || []).join('; ') +
      '\nKey Requirements: ' + (selected.key_requirements || []).join('; ') +
      '\nIncumbent: ' + (selected.incumbent || 'Unknown') +
      '\nRecompete: ' + (selected.recompete ? 'Yes' : 'No') +
      '\n\nHGI KB:\n' + (kb || '').slice(0, 1500) +
      '\n\nProvide:\n1. PROBABILITY OF WIN (Pwin) — specific percentage with justification\n2. GO / CONDITIONAL GO / NO-BID recommendation\n3. Top 3 win factors\n4. Top 3 risk factors\n5. Price-to-Win estimate if possible\n6. Teaming recommendation — prime or sub, potential partners',
      'You are HGI chief capture strategist. Be decisive. Give a clear recommendation.', 2000
    );
    setScoringResult(txt);
    setScoring(false);
  };

  const runOrchestrate = async () => {
    if (!selected) return;
    setOrchestrating(true);
    setOrchestrateResult(null);
    try {
      const r = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: selected.id, trigger: 'manual' })
      });
      const d = await r.json();
      setOrchestrateResult(d);
      // Reload the opportunity data to show updated fields
      const r2 = await fetch('/api/opportunities?sort=opi_score.desc&limit=20');
      const d2 = await r2.json();
      const list = (d2.opportunities || d2 || []).filter(o => o.status === 'active');
      setOpps(list);
      const updated = list.find(o => o.id === selected.id);
      if (updated) setSelected(updated);
    } catch(e) { setOrchestrateResult({ error: e.message }); }
    setOrchestrating(false);
  };

  const runDeepScope = async () => {
    if (!selected) return;
    setAnalyzingScope(true);
    setScopeAnalysis('');
    
    // Step 1: Try to fetch the actual source page for more detail
    let sourceContent = '';
    if (selected.source_url) {
      setFetchingSource(true);
      try {
        const fetchR = await fetch('/api/fetch-rfp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: selected.source_url })
        });
        if (fetchR.ok) {
          const fetchD = await fetchR.json();
          sourceContent = (fetchD.textContent || '').slice(0, 8000);
        }
      } catch(e) { console.warn('Source fetch failed:', e.message); }
      setFetchingSource(false);
    }

    const kb = await queryKB(selected.vertical || 'disaster');
    const txt = await callClaude(
      'Deep scope of work analysis for HGI go/no-go decision.\n\n' +
      'OPPORTUNITY: ' + selected.title + '\n' +
      'AGENCY: ' + selected.agency + '\n' +
      'VERTICAL: ' + (selected.vertical || 'general') + '\n' +
      'OPI SCORE: ' + selected.opi_score + '\n' +
      'DESCRIPTION: ' + (selected.description || '') + '\n' +
      'CURRENT SCOPE BULLETS: ' + (selected.scope_of_work || []).join('; ') + '\n' +
      'KEY REQUIREMENTS: ' + (selected.key_requirements || []).join('; ') + '\n' +
      'RFP TEXT: ' + (selected.rfp_text || '').slice(0, 3000) + '\n' +
      (sourceContent ? '\nSOURCE PAGE CONTENT:\n' + sourceContent.slice(0, 5000) : '') +
      '\n\nHGI KB:\n' + (kb || '').slice(0, 2000) +
      '\n\nProvide a COMPREHENSIVE scope analysis with these sections:\n\n' +
      '1. SCOPE SUMMARY — What is actually being asked for? Rewrite in plain English, 3-5 sentences.\n\n' +
      '2. DETAILED DELIVERABLES — Break down every deliverable, task, and work product the winning firm must produce. Be exhaustive. If the RFP text is thin, infer from the opportunity type and agency what the full scope likely includes based on similar contracts.\n\n' +
      '3. EVALUATION CRITERIA — What will the agency evaluate? If not stated, predict based on similar Louisiana school board procurements.\n\n' +
      '4. STAFFING IMPLICATIONS — What roles and how many staff would HGI need? Reference the HGI rate card.\n\n' +
      '5. HGI CAPABILITY ALIGNMENT — For each deliverable, map it to specific HGI past performance. Red flag any gaps.\n\n' +
      '6. COMPLIANCE REQUIREMENTS — Licenses, certifications, insurance, bonding, registrations needed.\n\n' +
      '7. MISSING INFORMATION — What critical details are not available from the listing? What questions should HGI ask the agency before bidding?\n\n' +
      '8. ESTIMATED LEVEL OF EFFORT — Hours by role, total estimated cost to HGI, suggested pricing range.',
      'You are a senior government contracting analyst with deep expertise in Louisiana school board procurements and insurance/TPA services. Be specific and thorough. This analysis determines whether HGI commits resources to pursue this opportunity. When the RFP text is thin, use your knowledge of similar procurements to fill in what the full scope likely includes. Reference HGI rate card: Principal $180/hr, Program Director $165/hr, SME $155/hr, PM $140/hr, Grant Manager $120/hr, Admin Support $65/hr.', 4000
    );
    setScopeAnalysis(txt);
    setAnalyzingScope(false);
  };

  if (loading) return React.createElement('div', {style:{color:GOLD,padding:40,textAlign:'center',animation:'pulse 1.2s infinite'}}, 'Loading pipeline...');

  if (!opps.length) return React.createElement(Card, {style:{textAlign:'center',padding:48}},
    React.createElement('div', {style:{color:TEXT_D,fontSize:16}}, 'No active opportunities in pipeline yet. The scraper is running — check back soon.')
  );

  const o = selected;
  const days = o ? daysLeft(o.due_date) : null;
  const daysColor = days !== null ? (days <= 7 ? RED : days <= 14 ? ORANGE : days <= 30 ? GOLD : GREEN) : TEXT_D;

  return React.createElement('div', null,
    // Title
    React.createElement('div', {style:{marginBottom:4}},
      React.createElement('h2', {style:{color:GOLD,margin:0,fontSize:20,fontWeight:800}}, 'Opportunity Brief'),
      React.createElement('p', {style:{color:TEXT_D,margin:'4px 0 0',fontSize:12}}, 'Complete go/no-go decision view — one screen, everything you need')
    ),

    // Opportunity selector pills
    React.createElement('div', {style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:20,paddingBottom:12,borderBottom:'1px solid '+BORDER}},
      opps.map(op => React.createElement('button', {
        key: op.id,
        onClick: () => { setSelected(op); setResearchResult(''); setScoringResult(''); },
        style: {
          padding:'6px 14px',borderRadius:4,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'none',
          background: selected && selected.id === op.id ? GOLD : BG3,
          color: selected && selected.id === op.id ? '#000' : TEXT_D,
          fontWeight: selected && selected.id === op.id ? 700 : 400
        }
      }, (op.opi_score || '?') + ' — ' + (op.title || '').slice(0, 40)))
    ),

    o && React.createElement('div', null,

      // HEADER
      React.createElement(Card, {style:{marginBottom:16,borderLeft:'4px solid '+GOLD}},
        React.createElement('div', {style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}},
          React.createElement('div', {style:{flex:1,minWidth:300}},
            React.createElement('h1', {style:{color:GOLD,margin:'0 0 6px',fontSize:22,fontWeight:800}}, o.title),
            React.createElement('div', {style:{color:TEXT,fontSize:15,marginBottom:8}}, o.agency),
            React.createElement('div', {style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}},
              React.createElement(OPIBadge, {score: o.opi_score}),
              o.urgency && React.createElement(Badge, {color: o.urgency==='IMMEDIATE'?RED:o.urgency==='ACTIVE'?GOLD:BLUE}, o.urgency),
              o.vertical && React.createElement(Badge, {color: TEXT_D}, o.vertical),
              o.hgi_relevance && React.createElement(Badge, {color: o.hgi_relevance==='HIGH'?GREEN:o.hgi_relevance==='MEDIUM'?GOLD:RED}, o.hgi_relevance + ' FIT'),
              days !== null && React.createElement('span', {style:{color:daysColor,fontSize:13,fontWeight:700}}, days + ' days left')
            )
          ),
          React.createElement('div', {style:{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}},
            React.createElement('div', {style:{fontSize:48,fontWeight:800,color:o.opi_score>=70?GREEN:o.opi_score>=45?GOLD:RED,lineHeight:1}}, o.opi_score || '?'),
            React.createElement('div', {style:{fontSize:10,color:TEXT_D,letterSpacing:'0.08em'}}, 'OPI SCORE'),
            o.due_date && React.createElement('div', {style:{fontSize:12,color:daysColor,fontWeight:600}}, 'Due: ' + o.due_date),
            o.source_url && React.createElement('a', {href:o.source_url,target:'_blank',rel:'noopener noreferrer',style:{padding:'4px 12px',borderRadius:4,fontSize:11,fontWeight:700,background:BLUE+'22',color:BLUE,border:'1px solid '+BLUE+'44',textDecoration:'none'}}, 'View Source →')
          )
        )
      ),

      // EXECUTIVE SUMMARY
      React.createElement(Card, {style:{marginBottom:16}},
        React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, 'EXECUTIVE SUMMARY'),
        o.description && React.createElement('div', {style:{color:TEXT,fontSize:13,lineHeight:1.7,marginBottom:12}}, o.description),
        o.hgi_fit && React.createElement('div', {style:{background:BG3,borderRadius:4,padding:14,border:'1px solid '+GOLD+'22'}},
          React.createElement('div', {style:{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}, 'HGI FIT ANALYSIS'),
          React.createElement('div', {style:{color:TEXT_D,fontSize:12,lineHeight:1.7,whiteSpace:'pre-wrap'}}, o.hgi_fit)
        )
      ),

      // GO/NO-GO
      React.createElement(Card, {style:{marginBottom:16,border:'1px solid '+GREEN+'33'}},
        React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:12}}, 'GO / NO-GO DECISION FACTORS'),
        React.createElement('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}},
          React.createElement('div', null,
            React.createElement('div', {style:{color:GREEN,fontSize:11,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}, 'WHY HGI WINS'),
            (o.why_hgi_wins || []).map((w, i) => React.createElement('div', {key:i,style:{fontSize:12,color:TEXT_D,marginBottom:6,paddingLeft:12,borderLeft:'2px solid '+GREEN+'44'}}, '✓ ' + w))
          ),
          React.createElement('div', null,
            React.createElement('div', {style:{color:ORANGE,fontSize:11,fontWeight:700,letterSpacing:'0.08em',marginBottom:8}}, 'KEY REQUIREMENTS'),
            (o.key_requirements || []).map((r, i) => React.createElement('div', {key:i,style:{fontSize:12,color:TEXT_D,marginBottom:6,paddingLeft:12,borderLeft:'2px solid '+ORANGE+'44'}}, r))
          )
        ),
        o.capture_action && React.createElement('div', {style:{padding:'10px 14px',background:GOLD+'11',border:'1px solid '+GOLD+'33',borderRadius:4,marginBottom:12}},
          React.createElement('div', {style:{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}, 'CAPTURE ACTION'),
          React.createElement('div', {style:{color:TEXT,fontSize:13,lineHeight:1.6}}, o.capture_action)
        ),
        React.createElement('div', {style:{display:'flex',gap:20,fontSize:12,color:TEXT_D}},
          o.incumbent && React.createElement('span', null, 'Incumbent: ', React.createElement('strong', {style:{color:ORANGE}}, o.incumbent)),
          React.createElement('span', null, 'Recompete: ', React.createElement('strong', {style:{color:TEXT}}, o.recompete ? 'Yes' : 'No'))
        )
      ),

      // SCOPE
      React.createElement(Card, {style:{marginBottom:16}},
        React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, 'SCOPE OF WORK'),
        (o.scope_of_work && o.scope_of_work.length > 0) 
          ? o.scope_of_work.map((s, i) => React.createElement('div', {key:i,style:{fontSize:12,color:TEXT_D,marginBottom:6,paddingLeft:12,borderLeft:'2px solid '+GOLD+'44'}}, s))
          : React.createElement('div', {style:{fontSize:12,color:TEXT_D,marginBottom:10,fontStyle:'italic'}}, 'No scope details extracted from listing. Run Deep Scope Analysis to generate a comprehensive breakdown.'),
        React.createElement('div', {style:{marginTop:12}},
          React.createElement(Btn, {onClick:runDeepScope,disabled:analyzingScope,small:true},
            fetchingSource ? 'Fetching source document...' : analyzingScope ? 'Analyzing scope in depth...' : 'Deep Scope Analysis'
          )
        )
      ),

      // DEEP SCOPE ANALYSIS OUTPUT
      scopeAnalysis && React.createElement(Card, {style:{marginBottom:16,border:'1px solid '+GOLD+'44'}},
        React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, 'DEEP SCOPE ANALYSIS'),
        React.createElement('div', {style:{color:TEXT_D,fontSize:12,lineHeight:1.8,whiteSpace:'pre-wrap'}}, scopeAnalysis)
      ),

      // ACTION BUTTONS
      React.createElement(Card, {style:{marginBottom:16}},
        React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:12}}, 'DECISION ACTIONS'),
        React.createElement('div', {style:{display:'flex',gap:10,flexWrap:'wrap'}},
          React.createElement(Btn, {onClick:runOrchestrate,disabled:orchestrating,style:{background:GREEN,color:'#000'}}, orchestrating ? 'Running Full Intelligence Workflow...' : 'Run Full Intelligence Workflow'),
          React.createElement(Btn, {onClick:runResearch,disabled:researching}, researching ? 'Researching...' : 'Run Full Research'),
          React.createElement(Btn, {onClick:runWinnability,disabled:scoring,variant:'secondary'}, scoring ? 'Scoring...' : 'Score Winnability'),
          React.createElement(Btn, {variant:'ghost',onClick:()=>alert('Navigate to Proposal Engine and paste this RFP context to start drafting.')}, 'Start Proposal →'),
          o.source_url && React.createElement('a', {href:o.source_url,target:'_blank',rel:'noopener noreferrer',style:{padding:'9px 18px',borderRadius:4,fontSize:13,fontWeight:600,background:BLUE+'22',color:BLUE,border:'1px solid '+BLUE+'44',textDecoration:'none',display:'inline-block'}}, 'Open Source Document')
        )
      ),

      // RESEARCH OUTPUT
      researchResult && React.createElement('div', {style:{marginBottom:16}},
        React.createElement(AIOut, {content:researchResult,label:'CAPTURE INTELLIGENCE BRIEF'})
      ),

      // WINNABILITY OUTPUT
      scoringResult && React.createElement('div', {style:{marginBottom:16}},
        React.createElement(AIOut, {content:scoringResult,label:'WINNABILITY ASSESSMENT'})
      ),

      orchestrateResult && React.createElement(Card, {style:{marginBottom:16,border:'1px solid '+GREEN+'44'}},
        React.createElement('div', {style:{color:GREEN,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:8}}, 'ORCHESTRATION RESULT'),
        React.createElement('div', {style:{fontSize:12,color:TEXT_D}},
          'Steps: ' + (orchestrateResult.steps_completed || []).join(' → ')),
        orchestrateResult.pwin && React.createElement('div', {style:{fontSize:16,fontWeight:800,color:orchestrateResult.pwin>=60?GREEN:orchestrateResult.pwin>=40?GOLD:RED,marginTop:8}},
          'Pwin: ' + orchestrateResult.pwin + '% | ' + orchestrateResult.recommendation),
        orchestrateResult.duration_ms && React.createElement('div', {style:{fontSize:11,color:TEXT_D,marginTop:4}},
          'Completed in ' + Math.round(orchestrateResult.duration_ms/1000) + ' seconds'),
        orchestrateResult.error && React.createElement('div', {style:{color:RED,fontSize:12,marginTop:4}}, orchestrateResult.error)
      )
    )
  );
}