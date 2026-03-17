const { useState, useEffect, useRef } = React;
const GOLD="#C9A84C",GOLD_D="#8B6E2E",BG="#0A0A0A",BG2="#111111",BG3="#191919",BG4="#222222";
const TEXT="#E8E0D0",TEXT_D="#888070",BORDER="#2A2520",RED="#C0392B",GREEN="#27AE60",BLUE="#2980B9",ORANGE="#E67E22";

const HGI_CONTEXT = "Hammerman & Gainer LLC (HGI) — 96 years. Disaster Recovery, CDBG-DR, TPA/Claims, Housing, Construction Management. Past performance: Road Home $13B+, HAP $950M, Restore Louisiana $42M, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20yrs Texas, Terrebonne Parish $200M+, St John Sheriff. Geography: Louisiana, Gulf Coast, Texas. ~67 FT employees + 43 contract. 100% minority-owned.";

const isMobile = window.innerWidth < 768;
window.isMobile = isMobile;

async function queryKB(vertical) {
  try {
    var v = vertical || "disaster_recovery";
    var r = await fetch("/api/knowledge-query?vertical=" + encodeURIComponent(v));
    if (!r.ok) return "";
    var data = await r.json();
    return data.prompt_injection || "";
  } catch(e) { return ""; }
}

const store = {
  get(k){try{var v=localStorage.getItem('hgi_'+k);return v?JSON.parse(v):null}catch(e){return null}},
  set(k,v){try{localStorage.setItem('hgi_'+k,JSON.stringify(v))}catch(e){}}
};

async function callClaude(prompt, system, maxTokens) {
  try {
    var body = { model: "claude-sonnet-4-20250514", max_tokens: maxTokens || 3000, system: system || "You are an expert government contracting capture manager for HGI. " + HGI_CONTEXT, messages: [{ role: "user", content: prompt }] };
    var r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { var errText = await r.text(); return "API error " + r.status + ": " + errText; }
    var d = await r.json();
    if (!d.content) return "No content returned.";
    return d.content.filter(function(b){return b.type === "text"}).map(function(b){return b.text}).join("") || "No response.";
  } catch(err) { return "Error: " + err.message; }
}

function parseBold(str, idx) {
  if (!str || str.indexOf('**') === -1) return str;
  var parts = [];
  var remaining = str;
  var sc = 0;
  while (remaining.indexOf('**') !== -1 && sc < 20) {
    sc++;
    var start = remaining.indexOf('**');
    if (start > 0) parts.push(remaining.slice(0, start));
    remaining = remaining.slice(start + 2);
    var end = remaining.indexOf('**');
    if (end === -1) { parts.push('**' + remaining); remaining = ''; break; }
    parts.push(React.createElement('strong', {key:'b'+idx+'_'+sc,style:{color:TEXT}}, remaining.slice(0, end)));
    remaining = remaining.slice(end + 2);
  }
  if (remaining) parts.push(remaining);
  return parts.length > 0 ? parts : str;
}

function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return [React.createElement('span', {key:'e'}, '')];
  var lines = text.split('\n');
  var elements = [];
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (trimmed.indexOf('### ') === 0) {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:14,fontWeight:700,color:TEXT,marginTop:10,marginBottom:4}}, trimmed.slice(4)));
    } else if (trimmed.indexOf('## ') === 0) {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:15,fontWeight:700,color:GOLD,marginTop:14,marginBottom:6}}, trimmed.slice(3)));
    } else if (trimmed.indexOf('# ') === 0) {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:18,fontWeight:800,color:GOLD,marginTop:16,marginBottom:8,borderBottom:'1px solid '+GOLD+'33',paddingBottom:6}}, trimmed.slice(2)));
    } else if (trimmed === '---' || trimmed === '***') {
      elements.push(React.createElement('hr', {key:'md'+i,style:{border:'none',borderTop:'1px solid '+BORDER,margin:'12px 0'}}));
    } else if (trimmed.indexOf('- ') === 0 || trimmed.indexOf('* ') === 0) {
      var bt = trimmed.slice(2);
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:4,paddingLeft:14,borderLeft:'2px solid '+GOLD+'44'}}, parseBold(bt, i)));
    } else if (/^\d+[\.\\)]\s/.test(trimmed)) {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,paddingLeft:14,borderLeft:'2px solid '+BLUE+'44'}}, parseBold(trimmed, i)));
    } else {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,lineHeight:1.7}}, parseBold(trimmed, i)));
    }
  }
  if (elements.length === 0) elements.push(React.createElement('span', {key:'fallback'}, text));
  return elements;
}

var Badge = function(props) {
  var color = props.color || GOLD;
  return React.createElement('span', {style:{display:"inline-block",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:700,letterSpacing:"0.08em",background:color+"22",color:color,border:"1px solid "+color+"44",textTransform:"uppercase"}}, props.children);
};
var Card = function(props) {
  return React.createElement('div', {className:"card",style:Object.assign({background:BG2,border:"1px solid "+BORDER,borderRadius:6,padding:16}, props.style || {})}, props.children);
};
var Btn = function(props) {
  var v = props.variant || "primary";
  var base = {cursor:props.disabled?"not-allowed":"pointer",border:"none",borderRadius:4,fontFamily:"inherit",fontWeight:600,letterSpacing:"0.05em",padding:props.small?"5px 12px":"9px 18px",fontSize:props.small?12:13,opacity:props.disabled?0.5:1};
  var vs = {primary:{background:GOLD,color:BG},secondary:{background:BG4,color:TEXT,border:"1px solid "+BORDER},danger:{background:RED+"22",color:RED,border:"1px solid "+RED+"44"},ghost:{background:"transparent",color:GOLD,border:"1px solid "+GOLD+"44"}};
  return React.createElement('button', {className:"btn",style:Object.assign({},base,vs[v]||vs.primary,props.style||{}),onClick:props.disabled?undefined:props.onClick}, props.children);
};
var Input = function(props) {
  return React.createElement('input', {value:props.value,onChange:function(e){props.onChange(e.target.value)},placeholder:props.placeholder,style:Object.assign({background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none",width:"100%"},props.style||{})});
};
var Textarea = function(props) {
  return React.createElement('textarea', {value:props.value,onChange:function(e){props.onChange(e.target.value)},placeholder:props.placeholder,rows:props.rows||4,style:Object.assign({width:"100%",background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:10,resize:"vertical",outline:"none",lineHeight:1.6},props.style||{})});
};
var Sel = function(props) {
  return React.createElement('select', {value:props.value,onChange:function(e){props.onChange(e.target.value)},style:Object.assign({background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none"},props.style||{})},(props.options||[]).map(function(o){return React.createElement('option',{key:o.value,value:o.value},o.label)}));
};
var Label = function(props) {
  return React.createElement('label', {style:{display:"block",fontSize:11,color:TEXT_D,marginBottom:4,letterSpacing:"0.06em"}}, props.text);
};
var AIOut = function(props) {
  var content = props.content;
  var loading = props.loading;
  var label = props.label || "AI ANALYSIS";
  if (loading) return React.createElement('div', {style:{color:GOLD,fontSize:13,padding:12,background:BG3,borderRadius:4,border:'1px solid '+GOLD+'33',animation:'pulse 1.2s infinite'}}, 'generating ' + label + '...');
  if (!content) return null;
  var rendered = renderMarkdown(content);
  return React.createElement('div', {style:{background:BG3,border:'1px solid '+GOLD+'33',borderRadius:4,padding:14}},
    React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, label),
    React.createElement('div', null, rendered));
};
var OPIBadge = function(props) {
  var score = props.score;
  if (!score && score !== 0) return null;
  var n = parseInt(score);
  var color = n>=70?GREEN:n>=45?GOLD:RED;
  var tier = n>=70?"Tier 1":n>=45?"Tier 2":n>=25?"Tier 3":"Archive";
  return React.createElement('span', {style:{background:color+"22",border:"1px solid "+color+"44",borderRadius:4,padding:"4px 10px",color:color,fontWeight:700}}, "OPI " + n + " \u2014 " + tier);
};

var _pipelineCache = { data: null, timestamp: 0, loading: false, promise: null };
var PIPELINE_TTL = 60000;

async function fetchPipelineData() {
  var now = Date.now();
  if (_pipelineCache.data && (now - _pipelineCache.timestamp) < PIPELINE_TTL) return _pipelineCache.data;
  if (_pipelineCache.loading && _pipelineCache.promise) return _pipelineCache.promise;
  _pipelineCache.loading = true;
  _pipelineCache.promise = fetch('/api/opportunities?sort=opi_score.desc&limit=30')
    .then(function(r) { return r.ok ? r.json() : { opportunities: [] }; })
    .then(function(d) {
      var list = (d.opportunities || d || []).filter(function(o) { return o.status === 'active'; });
      _pipelineCache.data = list;
      _pipelineCache.timestamp = Date.now();
      _pipelineCache.loading = false;
      return list;
    })
    .catch(function() { _pipelineCache.loading = false; return _pipelineCache.data || []; });
  return _pipelineCache.promise;
}

function invalidatePipelineCache() { _pipelineCache.data = null; _pipelineCache.timestamp = 0; }

function usePipeline() {
  var state = useState([]);
  var pipeline = state[0]; var setPipeline = state[1];
  var selState = useState(null);
  var selected = selState[0]; var setSelected = selState[1];
  var loadState = useState(true);
  var loading = loadState[0]; var setLoading = loadState[1];

  useEffect(function() {
    fetchPipelineData().then(function(data) { setPipeline(data); setLoading(false); });
  }, []);

  var select = function(opp) {
    setSelected(opp);
    if (opp) {
      store.set('sharedCtx', {
        rfpText: opp.rfp_text || '', decomposition: opp.scope_analysis || '',
        execBrief: opp.description || '', title: opp.title || '',
        agency: opp.agency || '', vertical: opp.vertical || '',
        research: opp.research_brief || '', value: opp.estimated_value || ''
      });
    }
  };

  var writeBack = async function(opportunityId, updates) {
    try {
      var r = await fetch('/api/opportunities', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ id: opportunityId }, updates))
      });
      if (r.ok) {
        invalidatePipelineCache();
        setPipeline(function(prev) { return prev.map(function(o) { return o.id === opportunityId ? Object.assign({}, o, updates) : o; }); });
        if (selected && selected.id === opportunityId) { setSelected(function(prev) { return Object.assign({}, prev, updates); }); }
      }
      return r.ok;
    } catch(e) { return false; }
  };

  var refresh = function() {
    invalidatePipelineCache(); setLoading(true);
    fetchPipelineData().then(function(data) { setPipeline(data); setLoading(false); });
  };

  return { pipeline: pipeline, selected: selected, select: select, writeBack: writeBack, loading: loading, refresh: refresh };
}

function OpportunitySelector(props) {
  var pl = props.pipeline || [];
  var selected = props.selected;
  var onSelect = props.onSelect;
  var loading = props.loading;
  var label = props.label || 'SELECT OPPORTUNITY';
  var minOpi = props.minOpi || 0;
  var filtered = pl.filter(function(o) { return (o.opi_score || 0) >= minOpi; });

  if (loading) return React.createElement('div', {style:{padding:'10px 14px',background:BG2,border:'1px solid '+BORDER,borderRadius:6,marginBottom:16}}, React.createElement('div', {style:{color:GOLD,fontSize:12,animation:'pulse 1.2s infinite'}}, 'Loading pipeline...'));
  if (filtered.length === 0) return React.createElement('div', {style:{padding:'10px 14px',background:ORANGE+'11',border:'1px solid '+ORANGE+'33',borderRadius:6,marginBottom:16}}, React.createElement('div', {style:{color:ORANGE,fontSize:12}}, 'No active opportunities in pipeline.'));

  var now = new Date();
  return React.createElement('div', {style:{marginBottom:16}},
    React.createElement('div', {style:{fontSize:10,color:TEXT_D,letterSpacing:'0.08em',fontWeight:700,marginBottom:8}}, label),
    React.createElement('div', {style:{display:'flex',gap:6,flexWrap:'wrap'}},
      filtered.map(function(o) {
        var isActive = selected && selected.id === o.id;
        var opi = o.opi_score || 0;
        var opiColor = opi >= 70 ? GREEN : opi >= 45 ? GOLD : RED;
        var daysLeft = null;
        if (o.due_date) { try { var due = new Date(o.due_date); if (!isNaN(due.getTime())) daysLeft = Math.ceil((due - now) / (1000*60*60*24)); } catch(e) {} }
        return React.createElement('button', {
          key: o.id, onClick: function() { onSelect(o); },
          style: { padding:'8px 12px', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:'inherit',
            background: isActive ? opiColor+'22' : BG3, color: isActive ? TEXT : TEXT_D,
            border: '1px solid '+(isActive ? opiColor : BORDER), borderLeft: '3px solid '+opiColor,
            fontWeight: isActive ? 700 : 400, textAlign:'left', maxWidth:280, lineHeight:1.3 }
        },
          React.createElement('div', {style:{fontWeight:600,color:isActive?TEXT:TEXT_D,fontSize:11,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:240}}, o.title),
          React.createElement('div', {style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},
            React.createElement('span', {style:{color:opiColor,fontWeight:700,fontSize:10}}, 'OPI '+opi),
            o.agency && React.createElement('span', {style:{color:TEXT_D,fontSize:9}}, o.agency),
            daysLeft !== null && daysLeft > 0 && daysLeft <= 30 && React.createElement('span', {style:{color:daysLeft<=7?RED:ORANGE,fontSize:9,fontWeight:700}}, daysLeft+'d left')
          )
        );
      })
    ),
    selected && React.createElement('div', {style:{marginTop:10,padding:'10px 14px',background:GREEN+'11',border:'1px solid '+GREEN+'33',borderRadius:6}},
      React.createElement('div', {style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        React.createElement('span', {style:{color:GREEN,fontSize:11,fontWeight:700}}, '\u2713 LOADED:'),
        React.createElement('span', {style:{color:TEXT,fontSize:12,fontWeight:600}}, selected.title),
        React.createElement(OPIBadge, {score: selected.opi_score}),
        selected.agency && React.createElement('span', {style:{color:TEXT_D,fontSize:11}}, '\u2014 ' + selected.agency)
      )
    )
  );
}