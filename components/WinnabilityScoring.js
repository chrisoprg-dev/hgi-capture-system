// ── WINNABILITY SCORING ───────────────────────────────────────────────────────
function WinnabilityScoring() {
  var pl = usePipeline();
  var pipeline = pl.pipeline;
  var selected = pl.selected;
  var selectOpp = pl.select;
  var writeBack = pl.writeBack;
  var plLoading = pl.loading;

  var fState = useState({title:"",agency:"",value:"",type:"",hgiPP:5,budget:5,timeline:5,incumbent:"",competitors:"",teaming:"",revenueTimeline:"near",context:""});
  var f = fState[0];
  var setF = fState[1];
  var scoreState = useState("");
  var score = scoreState[0];
  var setScore = scoreState[1];
  var simState = useState(null);
  var simResult = simState[0];
  var setSimResult = simState[1];
  var loadState = useState(false);
  var loading = loadState[0];
  var setLoading = loadState[1];

  var upd = function(k,v) { setF(function(p) { var n = Object.assign({}, p); n[k] = v; return n; }); };

  // Auto-populate from selected opportunity
  useEffect(function() {
    if (selected) {
      setF(function(prev) {
        return Object.assign({}, prev, {
          title: selected.title || "",
          agency: selected.agency || "",
          value: selected.estimated_value || "",
          type: selected.vertical || "",
          incumbent: selected.incumbent || "",
          hgiPP: selected.opi_score ? Math.min(Math.round(selected.opi_score / 10), 10) : 5,
          context: (selected.description || "").slice(0, 300)
        });
      });
      // Show existing winnability if available
      if (selected.capture_action && selected.capture_action.indexOf("PWIN") !== -1) {
        setScore(selected.capture_action);
      } else {
        setScore("");
      }
    }
  }, [selected]);

  var compute = async function() {
    setLoading(true);
    // Inject scope and financial context if available from pipeline
    var scopeCtx = selected && selected.scope_analysis ? "\n\nSCOPE ANALYSIS:\n" + selected.scope_analysis.slice(0, 1000) : "";
    var finCtx = selected && selected.financial_analysis ? "\n\nFINANCIAL ANALYSIS:\n" + selected.financial_analysis.slice(0, 1000) : "";
    var resCtx = selected && selected.research_brief ? "\n\nRESEARCH BRIEF:\n" + selected.research_brief.slice(0, 1000) : "";
    var kbInjection = await queryKB(selected ? selected.vertical : "disaster_recovery");

    var txt = await callClaude(
      "Score HGI winnability AND OPI with FULL intelligence context:\n" +
      "Opportunity: " + f.title + "\nAgency: " + f.agency + "\nType: " + f.type +
      "\nValue: " + f.value + "\nRevenue Timeline: " + f.revenueTimeline +
      "\nHGI PP Match (1-10): " + f.hgiPP + "\nIncumbent: " + (f.incumbent||"Unknown") +
      "\nTeaming: " + (f.teaming||"Unknown") + "\nBudget certainty (1-10): " + f.budget +
      "\nCompetitors: " + (f.competitors||"Unknown") + "\nContext: " + f.context +
      scopeCtx + finCtx + resCtx +
      "\n\nHGI KB:\n" + (kbInjection || HGI_CONTEXT).slice(0, 2000) +
      "\n\nFirst line MUST be: PWIN: [number]% | RECOMMENDATION: [GO|CONDITIONAL GO|NO-BID]\n\n" +
      "Then provide:\n1. Pwin X/100 with sub-scores\n2. OPI X/100 with sub-scores\n3. Priority Tier (Tier 1/2/3/Archive)\n4. Decision justification — 3 sentences citing scope, financial, and competitive factors\n5. Top 3 win factors\n6. Top 3 risk factors\n7. Top 3 actions to increase win probability\n8. Teaming recommendation",
      "You are HGI's chief capture officer making the final bid decision. Be direct and decisive. Your first line MUST follow the exact format. " + HGI_CONTEXT,
      3000
    );
    setScore(txt);

    // Write back to database
    if (selected && selected.id) {
      writeBack(selected.id, { capture_action: txt.slice(0, 2000) });
    }

    // Parallel win simulation
    fetch('/api/win-simulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: f.title, agency: f.agency, vertical: f.type,
        opi_score: f.hgiPP * 10, competitors: f.competitors,
        incumbent: f.incumbent, relationship_strength: 'Warm',
        budget_certainty: f.budget, hgi_pp_match: f.hgiPP, notes: f.context
      })
    }).then(function(res) { return res.json(); })
      .then(function(data) { setSimResult(data); })
      .catch(function() {});

    setLoading(false);
  };

  return React.createElement('div', null,
    React.createElement('h2', {style:{color:GOLD,margin:"0 0 4px",fontSize:20,fontWeight:800}}, "Winnability Scoring"),
    React.createElement('p', {style:{color:TEXT_D,margin:"0 0 12px",fontSize:12}}, "Select an opportunity — auto-loads scope, financial, and research intelligence for informed scoring."),

    React.createElement(OpportunitySelector, {
      pipeline: pipeline, selected: selected, onSelect: selectOpp,
      loading: plLoading, label: "SELECT OPPORTUNITY TO SCORE"
    }),

    selected && selected.capture_action && selected.capture_action.indexOf("PWIN") !== -1 && !loading &&
      React.createElement('div', {style:{marginBottom:12,padding:"8px 12px",background:GREEN+"15",border:"1px solid "+GREEN+"44",borderRadius:4,fontSize:12,color:GREEN}},
        "✓ Winnability assessment exists. Score again to update."
      ),

    React.createElement('div', {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}},
      React.createElement(Card, null,
        React.createElement('h3', {style:{color:GOLD,margin:"0 0 14px",fontSize:14}}, "OPPORTUNITY DETAILS"),
        React.createElement('div', {style:{display:"flex",flexDirection:"column",gap:10}},
          React.createElement('div', null, React.createElement(Label, {text:"TITLE"}), React.createElement(Input, {value:f.title,onChange:function(v){upd("title",v)},placeholder:"Opportunity name"})),
          React.createElement('div', null, React.createElement(Label, {text:"AGENCY"}), React.createElement(Input, {value:f.agency,onChange:function(v){upd("agency",v)},placeholder:"Agency/client"})),
          React.createElement('div', null, React.createElement(Label, {text:"EST. VALUE"}), React.createElement(Input, {value:f.value,onChange:function(v){upd("value",v)},placeholder:"$50M"})),
          React.createElement('div', null, React.createElement(Label, {text:"TYPE"}), React.createElement(Input, {value:f.type,onChange:function(v){upd("type",v)},placeholder:"FEMA PA, TPA, CDBG-DR..."})),
          React.createElement('div', null, React.createElement(Label, {text:"KNOWN INCUMBENT"}), React.createElement(Input, {value:f.incumbent,onChange:function(v){upd("incumbent",v)},placeholder:"ICF / None / Unknown"})),
          React.createElement('div', null, React.createElement(Label, {text:"COMPETITORS"}), React.createElement(Input, {value:f.competitors,onChange:function(v){upd("competitors",v)},placeholder:"Witt, Hagerty, Dewberry..."})),
          React.createElement('div', null, React.createElement(Label, {text:"TEAMING NEEDED"}), React.createElement(Input, {value:f.teaming,onChange:function(v){upd("teaming",v)},placeholder:"Yes — need construction sub / No"})),
          React.createElement('div', null, React.createElement(Label, {text:"REVENUE TIMELINE"}),
            React.createElement(Sel, {value:f.revenueTimeline,onChange:function(v){upd("revenueTimeline",v)},options:[
              {value:"immediate",label:"Immediate (<90 days)"},
              {value:"near",label:"Near-term (90-180 days)"},
              {value:"medium",label:"Medium (180-365 days)"},
              {value:"long",label:"Long-term (365+ days)"}
            ],style:{width:"100%"}}))
        )
      ),
      React.createElement(Card, null,
        React.createElement('h3', {style:{color:GOLD,margin:"0 0 14px",fontSize:14}}, "SCORING FACTORS"),
        [["hgiPP","HGI PAST PERFORMANCE MATCH"],["budget","BUDGET CERTAINTY"],["timeline","TIMELINE FEASIBILITY"]].map(function(item) {
          var k = item[0]; var label = item[1];
          return React.createElement('div', {key:k,style:{marginBottom:12}},
            React.createElement('div', {style:{display:"flex",justifyContent:"space-between",marginBottom:4}},
              React.createElement(Label, {text:label}),
              React.createElement('span', {style:{color:GOLD,fontSize:12,fontWeight:700}}, f[k]+"/10")
            ),
            React.createElement('input', {type:"range",min:"1",max:"10",value:f[k],onChange:function(e){upd(k,parseInt(e.target.value))},style:{width:"100%",accentColor:GOLD}})
          );
        }),
        React.createElement('div', {style:{marginTop:10}},
          React.createElement(Label, {text:"ADDITIONAL CONTEXT"}),
          React.createElement(Textarea, {value:f.context,onChange:function(v){upd("context",v)},placeholder:"Agency relationships, political context...",rows:4})
        ),
        React.createElement(Btn, {onClick:compute,disabled:loading||!f.title,style:{marginTop:12,width:"100%"}},
          loading ? "Calculating..." : "Calculate Pwin + OPI"
        )
      )
    ),
    (loading||score) && React.createElement('div', {style:{marginTop:20}}, React.createElement(AIOut, {content:score,loading:loading,label:"PWIN + OPI ANALYSIS"})),
    simResult && React.createElement('div', {style:{marginTop:20}},
      React.createElement(Card, null,
        React.createElement('h3', {style:{color:GOLD,margin:"0 0 14px",fontSize:14}}, "WIN SIMULATION"),
        React.createElement('div', {style:{display:"flex",flexDirection:"column",gap:16}},
          React.createElement('div', null,
            React.createElement('div', {style:{fontSize:36,fontWeight:800,color:GOLD}}, simResult.pwin+"%"),
            React.createElement(Label, {text:"PWIN"})
          ),
          React.createElement('div', null,
            React.createElement('div', {style:{fontSize:18,fontWeight:700,color:TEXT}}, simResult.opi_recommended),
            React.createElement(Label, {text:"RECOMMENDED OPI"})
          ),
          simResult.top_3_actions && React.createElement('div', null,
            React.createElement(Label, {text:"TOP 3 ACTIONS"}),
            React.createElement('ul', {style:{margin:"4px 0 0 16px",padding:0,color:TEXT}},
              simResult.top_3_actions.map(function(action, i) {
                return React.createElement('li', {key:i,style:{marginBottom:4}}, action);
              })
            )
          )
        )
      )
    )
  );
}