const { useState, useEffect, useRef } = React;
const GOLD="#C9A84C",GOLD_D="#8B6E2E",BG="#0A0A0A",BG2="#111111",BG3="#191919",BG4="#222222";
const TEXT="#E8E0D0",TEXT_D="#888070",BORDER="#2A2520",RED="#C0392B",GREEN="#27AE60",BLUE="#2980B9",ORANGE="#E67E22";

const HGI_CONTEXT = "Hammerman & Gainer LLC (HGI) — 97 years. Disaster Recovery, CDBG-DR, TPA/Claims, Housing, Construction Management. Past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20yrs Texas, Restore Louisiana, Terrebonne Parish, Jefferson Parish FEMA PA. Geography: Louisiana, Gulf Coast, Texas.";

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
    } else if (/^\d+[\.\)]\s/.test(trimmed)) {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,paddingLeft:14,borderLeft:'2px solid '+BLUE+'44'}}, parseBold(trimmed, i)));
    } else {
      elements.push(React.createElement('div', {key:'md'+i,style:{fontSize:13,color:TEXT_D,marginBottom:6,lineHeight:1.7}}, parseBold(trimmed, i)));
    }
  }
  if (elements.length === 0) elements.push(React.createElement('span', {key:'fallback'}, text));
  return elements;
}

const Badge = function(props) {
  var color = props.color || GOLD;
  return React.createElement('span', {style:{display:"inline-block",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:700,letterSpacing:"0.08em",background:color+"22",color:color,border:"1px solid "+color+"44",textTransform:"uppercase"}}, props.children);
};
const Card = function(props) {
  return React.createElement('div', {className:"card",style:Object.assign({background:BG2,border:"1px solid "+BORDER,borderRadius:6,padding:16}, props.style || {})}, props.children);
};
const Btn = function(props) {
  var v = props.variant || "primary";
  var base = {cursor:props.disabled?"not-allowed":"pointer",border:"none",borderRadius:4,fontFamily:"inherit",fontWeight:600,letterSpacing:"0.05em",padding:props.small?"5px 12px":"9px 18px",fontSize:props.small?12:13,opacity:props.disabled?0.5:1};
  var vs = {primary:{background:GOLD,color:BG},secondary:{background:BG4,color:TEXT,border:"1px solid "+BORDER},danger:{background:RED+"22",color:RED,border:"1px solid "+RED+"44"},ghost:{background:"transparent",color:GOLD,border:"1px solid "+GOLD+"44"}};
  return React.createElement('button', {className:"btn",style:Object.assign({},base,vs[v]||vs.primary,props.style||{}),onClick:props.disabled?undefined:props.onClick}, props.children);
};
const Input = function(props) {
  return React.createElement('input', {value:props.value,onChange:function(e){props.onChange(e.target.value)},placeholder:props.placeholder,style:Object.assign({background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none",width:"100%"},props.style||{})});
};
const Textarea = function(props) {
  return React.createElement('textarea', {value:props.value,onChange:function(e){props.onChange(e.target.value)},placeholder:props.placeholder,rows:props.rows||4,style:Object.assign({width:"100%",background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:10,resize:"vertical",outline:"none",lineHeight:1.6},props.style||{})});
};
const Sel = function(props) {
  return React.createElement('select', {value:props.value,onChange:function(e){props.onChange(e.target.value)},style:Object.assign({background:BG3,border:"1px solid "+BORDER,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none"},props.style||{})},(props.options||[]).map(function(o){return React.createElement('option',{key:o.value,value:o.value},o.label)}));
};
const Label = function(props) {
  return React.createElement('label', {style:{display:"block",fontSize:11,color:TEXT_D,marginBottom:4,letterSpacing:"0.06em"}}, props.text);
};
const AIOut = function(props) {
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
const OPIBadge = function(props) {
  var score = props.score;
  if (!score && score !== 0) return null;
  var n = parseInt(score);
  var color = n>=70?GREEN:n>=45?GOLD:RED;
  var tier = n>=70?"Tier 1":n>=45?"Tier 2":n>=25?"Tier 3":"Archive";
  return React.createElement('span', {style:{background:color+"22",border:"1px solid "+color+"44",borderRadius:4,padding:"4px 10px",color:color,fontWeight:700}}, "OPI " + n + " \u2014 " + tier);
};