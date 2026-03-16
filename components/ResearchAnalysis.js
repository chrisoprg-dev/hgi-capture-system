// ── RESEARCH & ANALYSIS ─────────────────────────────────────────────────────
function ResearchAnalysis({ sharedCtx={}, saveSharedCtx=()=>{} }) {
  var pl = usePipeline();
  var pipeline = pl.pipeline;
  var selected = pl.selected;
  var selectOpp = pl.select;
  var writeBack = pl.writeBack;
  var plLoading = pl.loading;

  var agencyState = useState("");
  var agencyName = agencyState[0];
  var setAgencyName = agencyState[1];
  var oppTypeState = useState("");
  var oppType = oppTypeState[0];
  var setOppType = oppTypeState[1];
  var compState = useState("");
  var competitors = compState[0];
  var setCompetitors = compState[1];
  var ctxState = useState("");
  var context = ctxState[0];
  var setContext = ctxState[1];
  var resultState = useState("");
  var result = resultState[0];
  var setResult = resultState[1];
  var loadState = useState(false);
  var loading = loadState[0];
  var setLoading = loadState[1];

  var exportDocx = async function() {
    if (!result) return;
    try {
      var resp = await fetch('/api/export-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: 'research',
          title: selected ? selected.title : agencyName + ' — Research',
          agency: agencyName || (selected ? selected.agency : ''),
          content: result,
          metadata: selected ? {
            'Agency': selected.agency || '',
            'Vertical': selected.vertical || '',
            'Est. Value': selected.estimated_value || '',
            'Deadline': selected.due_date || '',
            'OPI Score': selected.opi_score ? selected.opi_score + '/100' : ''
          } : {}
        })
      });
      if (!resp.ok) throw new Error('Export failed');
      var blob = await resp.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'HGI_Research_' + (agencyName || 'Brief').replace(/[^a-zA-Z0-9]/g,'_') + '.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert('Export failed: ' + e.message); }
  };

  // Auto-populate fields when an opportunity is selected
  useEffect(function() {
    if (selected) {
      setAgencyName(selected.agency || "");
      setOppType(selected.vertical || "");
      // Extract competitors from research_brief or hgi_fit if available
      var compText = "";
      if (selected.research_brief && selected.research_brief.indexOf("COMPETITIVE") !== -1) {
        compText = "See existing research — competitors identified in prior analysis";
      }
      if (selected.hgi_fit && selected.hgi_fit.indexOf("CDM Smith") !== -1) compText = "CDM Smith, APTIM, local firms";
      if (selected.hgi_fit && selected.hgi_fit.indexOf("Witt") !== -1) compText = "Witt O'Brien's, Hagerty, RS&H";
      setCompetitors(compText);
      // Build rich context from all available data
      var ctxParts = [];
      if (selected.title) ctxParts.push("Opportunity: " + selected.title);
      if (selected.description) ctxParts.push(selected.description.slice(0, 300));
      if (selected.scope_analysis) ctxParts.push("Scope: " + selected.scope_analysis.slice(0, 200));
      if (selected.estimated_value) ctxParts.push("Value: " + selected.estimated_value);
      if (selected.due_date) ctxParts.push("Deadline: " + selected.due_date);
      setContext(ctxParts.join("\n"));
      // If there's already a research brief, show it
      if (selected.research_brief) {
        setResult(selected.research_brief);
      } else {
        setResult("");
      }
    }
  }, [selected]);

  var generate = async function() {
    setLoading(true);
    // Get KB injection for this vertical
    var kbInjection = await queryKB(selected ? selected.vertical : "disaster_recovery");
    var scopeContext = selected && selected.scope_analysis ? "\n\nSCOPE ANALYSIS (already completed):\n" + selected.scope_analysis.slice(0, 1500) : "";
    var financialContext = selected && selected.financial_analysis ? "\n\nFINANCIAL ANALYSIS (already completed):\n" + selected.financial_analysis.slice(0, 1000) : "";

    var txt = await callClaude(
      "Deep capture intelligence research for HGI.\n" +
      "Agency: " + agencyName +
      "\nOpportunity Type: " + oppType +
      "\nKnown Competitors: " + competitors +
      "\nContext: " + context +
      scopeContext + financialContext +
      "\n\nHGI INSTITUTIONAL KNOWLEDGE:\n" + (kbInjection || HGI_CONTEXT).slice(0, 3000) +
      "\n\nProvide a COMPLETE capture intelligence brief:\n" +
      "1. AGENCY PROFILE — budget, leadership, procurement patterns, political context\n" +
      "2. FUNDING LANDSCAPE — where the money comes from, budget cycle, grant sources\n" +
      "3. COMPETITIVE INTEL — who will bid, their strengths/weaknesses vs HGI, pricing patterns\n" +
      "4. RELATIONSHIP MAP — key decision makers, HGI connections, warm/cold assessment\n" +
      "5. HGI WIN STRATEGY — 3 specific differentiators mapped to evaluation criteria\n" +
      "6. RED FLAGS — from scope, financial, and competitive angles. Be honest.\n" +
      "7. INTEL GAPS — what we don't know and how to find it\n" +
      "8. 48-HOUR ACTION PLAN — exactly what to do, who to call, in priority order\n" +
      "9. RISKS & CHALLENGES — relationship gaps, geographic challenges, capability gaps, competitive disadvantages",
      "You are HGI's senior capture intelligence analyst. Every recommendation must be specific and actionable. Name real competitors. Reference real HGI past performance. Do not sugarcoat risks. " + HGI_CONTEXT,
      4000
    );
    setResult(txt);
    saveSharedCtx({ research: txt, researchAgency: agencyName });

    // Write back to database if we have a selected opportunity
    if (selected && selected.id) {
      writeBack(selected.id, { research_brief: txt });
    }

    setLoading(false);
  };

  return React.createElement('div', null,
    React.createElement('h2', {style:{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}, "Research & Analysis"),
    React.createElement('p', {style:{color:TEXT_D,margin:"0 0 12px",fontSize:12}}, "Select an opportunity from the pipeline — fields auto-populate from system intelligence. New research writes back to the database."),

    // Pipeline Selector
    React.createElement(OpportunitySelector, {
      pipeline: pipeline,
      selected: selected,
      onSelect: selectOpp,
      loading: plLoading,
      label: "SELECT OPPORTUNITY TO RESEARCH"
    }),

    // Show existing research status
    selected && selected.research_brief && !loading && React.createElement('div', {style:{marginBottom:12,padding:"8px 12px",background:GREEN+"15",border:"1px solid "+GREEN+"44",borderRadius:4,fontSize:12,color:GREEN}},
      "✓ Research brief exists for ", React.createElement('strong', null, selected.agency || "this opportunity"), ". Generate again to update with latest intelligence."
    ),

    // Input form
    React.createElement(Card, {style:{marginBottom:20}},
      React.createElement('div', {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}},
        React.createElement('div', null,
          React.createElement(Label, {text:"AGENCY / CLIENT"}),
          React.createElement(Input, {value:agencyName,onChange:setAgencyName,placeholder:"e.g. City of St. George, HTHA"})
        ),
        React.createElement('div', null,
          React.createElement(Label, {text:"OPPORTUNITY TYPE / VERTICAL"}),
          React.createElement(Input, {value:oppType,onChange:setOppType,placeholder:"e.g. disaster, tpa, workforce"})
        ),
        React.createElement('div', null,
          React.createElement(Label, {text:"KNOWN COMPETITORS"}),
          React.createElement(Input, {value:competitors,onChange:setCompetitors,placeholder:"e.g. ICF, Witt, Hagerty, APTIM"})
        ),
        React.createElement('div', null,
          React.createElement(Label, {text:"ADDITIONAL CONTEXT"}),
          React.createElement(Input, {value:context.split("\n")[0] || "",onChange:function(v) { setContext(v); },placeholder:"Disaster event, funding round, timeline..."})
        )
      ),
      React.createElement(Btn, {onClick:generate,disabled:loading||!agencyName}, loading ? "Researching..." : "Generate Research Pack")
    ),
    React.createElement('div', null,
      result && !loading && React.createElement('div', {style:{display:'flex',justifyContent:'flex-end',marginBottom:8}},
        React.createElement('button', {
          onClick: exportDocx,
          style:{background:'#1F3864',color:'#C9A84C',border:'1px solid #C9A84C',borderRadius:4,padding:'6px 16px',fontSize:12,fontWeight:700,cursor:'pointer',letterSpacing:'0.05em'}
        }, '⬇ Export .docx')
      ),
      React.createElement(AIOut, {content:result,loading:loading,label:"CAPTURE INTELLIGENCE BRIEF"})
    )
  );
}