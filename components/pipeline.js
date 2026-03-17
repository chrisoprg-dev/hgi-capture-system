// Pipeline integration layer - adds usePipeline, OpportunitySelector, renderMarkdown, parseBold
// Loaded after shared.js to extend the shared utilities

function parseBold(str, idx) {
  if (!str || str.indexOf('**') === -1) return str;
  var parts = [], remaining = str, sc = 0;
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
  var lines = text.split('\n'), elements = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) continue;
    if (t.indexOf('### ') === 0) elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:14,fontWeight:700,color:TEXT,marginTop:10,marginBottom:4}}, t.slice(4)));
    else if (t.indexOf('## ') === 0) elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:15,fontWeight:700,color:GOLD,marginTop:14,marginBottom:6}}, t.slice(3)));
    else if (t.indexOf('# ') === 0) elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:18,fontWeight:800,color:GOLD,marginTop:16,marginBottom:8,borderBottom:'1px solid '+GOLD+'33',paddingBottom:6}}, t.slice(2)));
    else if (t === '---' || t === '***') elements.push(React.createElement('hr', {key:'md'+i,style:{border:'none',borderTop:'1px solid '+BORDER,margin:'12px 0'}}));
    else if (t.indexOf('- ') === 0 || t.indexOf('* ') === 0) elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:4,paddingLeft:14,borderLeft:'2px solid '+GOLD+'44'}}, parseBold(t.slice(2), i)));
    else if (/^\d+[\.\)]\s/.test(t)) elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,paddingLeft:14,borderLeft:'2px solid '+BLUE+'44'}}, parseBold(t, i)));
    else elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,lineHeight:1.7}}, parseBold(t, i)));
  }
  if (elements.length === 0) elements.push(React.createElement('span', {key:'fallback'}, text));
  return elements;
}

// Override AIOut to use renderMarkdown
AIOut = function(props) {
  if (props.loading) return React.createElement('div', {style:{color:GOLD,fontSize:13,padding:12,background:BG3,borderRadius:4,border:'1px solid '+GOLD+'33',animation:'pulse 1.2s infinite'}}, 'generating ' + (props.label || 'AI ANALYSIS') + '...');
  if (!props.content) return null;
  return React.createElement('div', {style:{background:BG3,border:'1px solid '+GOLD+'33',borderRadius:4,padding:14}},
    React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, props.label || 'AI ANALYSIS'),
    React.createElement('div', null, renderMarkdown(props.content)));
};

var _pipelineCache = { data: null, timestamp: 0, loading: false, promise: null };

function fetchPipelineData() {
  var now = Date.now();
  if (_pipelineCache.data && (now - _pipelineCache.timestamp) < 60000) return Promise.resolve(_pipelineCache.data);
  if (_pipelineCache.loading && _pipelineCache.promise) return _pipelineCache.promise;
  _pipelineCache.loading = true;
  _pipelineCache.promise = fetch('/api/opportunities?sort=opi_score.desc&limit=30')
    .then(function(r) { return r.ok ? r.json() : { opportunities: [] }; })
    .then(function(d) {
      var list = (d.opportunities || d || []).filter(function(o) { return o.status === 'active'; });
      _pipelineCache.data = list; _pipelineCache.timestamp = Date.now(); _pipelineCache.loading = false;
      return list;
    })
    .catch(function() { _pipelineCache.loading = false; return _pipelineCache.data || []; });
  return _pipelineCache.promise;
}

function invalidatePipelineCache() { _pipelineCache.data = null; _pipelineCache.timestamp = 0; }

function usePipeline() {
  var s1 = useState([]); var pipeline = s1[0]; var setPipeline = s1[1];
  var s2 = useState(null); var selected = s2[0]; var setSelected = s2[1];
  var s3 = useState(true); var loading = s3[0]; var setLoading = s3[1];

  useEffect(function() { fetchPipelineData().then(function(d) { setPipeline(d); setLoading(false); }); }, []);

  var select = function(opp) {
    setSelected(opp);
    if (opp) store.set('sharedCtx', { rfpText: opp.rfp_text || '', decomposition: opp.scope_analysis || '', execBrief: opp.description || '', title: opp.title || '', agency: opp.agency || '', vertical: opp.vertical || '', research: opp.research_brief || '', value: opp.estimated_value || '' });
  };

  var writeBack = function(opportunityId, updates) {
    return fetch('/api/opportunities', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({id:opportunityId}, updates)) })
      .then(function(r) {
        if (r.ok) {
          invalidatePipelineCache();
          setPipeline(function(prev) { return prev.map(function(o) { return o.id === opportunityId ? Object.assign({}, o, updates) : o; }); });
          if (selected && selected.id === opportunityId) setSelected(function(prev) { return Object.assign({}, prev, updates); });
        }
        return r.ok;
      }).catch(function() { return false; });
  };

  var refresh = function() { invalidatePipelineCache(); setLoading(true); fetchPipelineData().then(function(d) { setPipeline(d); setLoading(false); }); };

  return { pipeline:pipeline, selected:selected, select:select, writeBack:writeBack, loading:loading, refresh:refresh };
}

function OpportunitySelector(props) {
  var pl = props.pipeline || [], selected = props.selected, onSelect = props.onSelect, loading = props.loading;
  var label = props.label || 'SELECT OPPORTUNITY', minOpi = props.minOpi || 0;
  var filtered = pl.filter(function(o) { return (o.opi_score || 0) >= minOpi; });
  if (loading) return React.createElement('div', {style:{padding:'10px 14px',background:BG2,border:'1px solid '+BORDER,borderRadius:6,marginBottom:16}}, React.createElement('div', {style:{color:GOLD,fontSize:12,animation:'pulse 1.2s infinite'}}, 'Loading pipeline...'));
  if (filtered.length === 0) return React.createElement('div', {style:{padding:'10px 14px',background:ORANGE+'11',border:'1px solid '+ORANGE+'33',borderRadius:6,marginBottom:16}}, React.createElement('div', {style:{color:ORANGE,fontSize:12}}, 'No active opportunities in pipeline.'));
  var now = new Date();
  return React.createElement('div', {style:{marginBottom:16}},
    React.createElement('div', {style:{fontSize:10,color:TEXT_D,letterSpacing:'0.08em',fontWeight:700,marginBottom:8}}, label),
    React.createElement('div', {style:{display:'flex',gap:6,flexWrap:'wrap'}}, filtered.map(function(o) {
      var isAct = selected && selected.id === o.id, opi = o.opi_score || 0;
      var oc = opi >= 70 ? GREEN : opi >= 45 ? GOLD : RED;
      var dl = null;
      if (o.due_date) { try { var dd = new Date(o.due_date); if (!isNaN(dd.getTime())) dl = Math.ceil((dd - now)/(86400000)); } catch(e){} }
      return React.createElement('button', {key:o.id, onClick:function(){onSelect(o)}, style:{padding:'8px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontFamily:'inherit',background:isAct?oc+'22':BG3,color:isAct?TEXT:TEXT_D,border:'1px solid '+(isAct?oc:BORDER),borderLeft:'3px solid '+oc,fontWeight:isAct?700:400,textAlign:'left',maxWidth:280,lineHeight:1.3}},
        React.createElement('div', {style:{fontWeight:600,color:isAct?TEXT:TEXT_D,fontSize:11,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:240}}, o.title),
        React.createElement('div', {style:{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}},
          React.createElement('span', {style:{color:oc,fontWeight:700,fontSize:10}}, 'OPI '+opi),
          o.agency && React.createElement('span', {style:{color:TEXT_D,fontSize:9}}, o.agency),
          dl !== null && dl > 0 && dl <= 30 && React.createElement('span', {style:{color:dl<=7?RED:ORANGE,fontSize:9,fontWeight:700}}, dl+'d left')
        )
      );
    })),
    selected && React.createElement('div', {style:{marginTop:10,padding:'10px 14px',background:GREEN+'11',border:'1px solid '+GREEN+'33',borderRadius:6}},
      React.createElement('div', {style:{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        React.createElement('span', {style:{color:GREEN,fontSize:11,fontWeight:700}}, '\u2713 LOADED:'),
        React.createElement('span', {style:{color:TEXT,fontSize:12,fontWeight:600}}, selected.title),
        React.createElement(OPIBadge, {score:selected.opi_score}),
        selected.agency && React.createElement('span', {style:{color:TEXT_D,fontSize:11}}, '\u2014 '+selected.agency)
      )
    )
  );
}