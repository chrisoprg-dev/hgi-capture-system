const { useState, useEffect, useRef } = React;
const GOLD="#C9A84C",GOLD_D="#8B6E2E",BG="#0A0A0A",BG2="#111111",BG3="#191919",BG4="#222222";
const TEXT="#E8E0D0",TEXT_D="#888070",BORDER="#2A2520",RED="#C0392B",GREEN="#27AE60",BLUE="#2980B9",ORANGE="#E67E22";

const HGI_CONTEXT = "Hammerman & Gainer LLC (HGI) — 95 years. Disaster Recovery, CDBG-DR, TPA/Claims, Housing, Construction Management. Past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20yrs Texas, Restore Louisiana, Terrebonne Parish, Jefferson Parish FEMA PA. Geography: Louisiana, Gulf Coast, Texas.";

// ── KB QUERY — fetches extracted institutional knowledge from Supabase ──────
async function queryKB(vertical) {
  try {
    const v = vertical || "disaster_recovery";
    const r = await fetch("/api/knowledge-query?vertical=" + encodeURIComponent(v));
    if (!r.ok) return "";
    const data = await r.json();
    return data.prompt_injection || "";
  } catch(e) {
    console.warn("KB query failed, using static context:", e.message);
    return "";
  }
}

const store = {
  get(k){try{const v=localStorage.getItem('hgi_'+k);return v?JSON.parse(v):null}catch{return null}},
  set(k,v){try{localStorage.setItem('hgi_'+k,JSON.stringify(v))}catch{}}
};

async function callClaude(prompt, system, maxTokens=3000) {
  try {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: system || "You are an expert government contracting capture manager for HGI. " + HGI_CONTEXT,
      messages: [{ role: "user", content: prompt }]
    };
    const r = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error("API error:", r.status, errText);
      return "API error " + r.status + ": " + errText;
    }
    const d = await r.json();
    if (!d.content) return "No content returned: " + JSON.stringify(d);
    return d.content.filter(b => b.type === "text").map(b => b.text).join("") || "No response.";
  } catch(err) {
    console.error("callClaude error:", err);
    return "Error: " + err.message;
  }
}

const Badge = ({children, color=GOLD}) => (
  <span style={{display:"inline-block",padding:"2px 8px",borderRadius:3,fontSize:10,fontWeight:700,
    letterSpacing:"0.08em",background:color+"22",color,border:`1px solid ${color}44`,textTransform:"uppercase"}}>
    {children}
  </span>
);
const Card = ({children, style}) => (
  <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:16,...style}}>{children}</div>
);
const Btn = ({children, onClick, variant="primary", disabled, small, style}) => {
  const base = {cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:4,fontFamily:"inherit",
    fontWeight:600,letterSpacing:"0.05em",padding:small?"5px 12px":"9px 18px",fontSize:small?12:13,opacity:disabled?0.5:1,...style};
  const v = {
    primary:{background:GOLD,color:BG},
    secondary:{background:BG4,color:TEXT,border:`1px solid ${BORDER}`},
    danger:{background:RED+"22",color:RED,border:`1px solid ${RED}44`},
    ghost:{background:"transparent",color:GOLD,border:`1px solid ${GOLD}44`}
  };
  return <button style={{...base,...v[variant]}} onClick={disabled?undefined:onClick}>{children}</button>;
};
const Input = ({value, onChange, placeholder, style}) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontFamily:"inherit",
      fontSize:13,padding:"8px 10px",outline:"none",width:"100%",...style}} />
);
const Textarea = ({value, onChange, placeholder, rows=4, style}) => (
  <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{width:"100%",background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,
      fontFamily:"inherit",fontSize:13,padding:10,resize:"vertical",outline:"none",lineHeight:1.6,...style}} />
);
const Sel = ({value, onChange, options, style}) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{background:BG3,border:`1px solid ${BORDER}`,borderRadius:4,color:TEXT,fontFamily:"inherit",fontSize:13,padding:"8px 10px",outline:"none",...style}}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
const Label = ({text}) => <label style={{display:"block",fontSize:11,color:TEXT_D,marginBottom:4,letterSpacing:"0.06em"}}>{text}</label>;
const AIOut = ({content, loading, label="AI ANALYSIS"}) => {
  if (loading) return <div style={{color:GOLD,fontSize:13,padding:12,background:BG3,borderRadius:4,border:`1px solid ${GOLD}33`,animation:"pulse 1.2s infinite"}}>
    ⟳ generating {label}...</div>;
  if (!content) return null;
  return <div style={{background:BG3,border:`1px solid ${GOLD}33`,borderRadius:4,padding:14,fontSize:13,lineHeight:1.75,color:TEXT,whiteSpace:"pre-wrap"}}>
    <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:"0.1em",marginBottom:8}}>{label}</div>
    {content}
  </div>;
};
const OPIBadge = ({score}) => {
  if (!score && score !== 0) return null;
  const n = parseInt(score);
  const color = n>=70?GREEN:n>=45?GOLD:RED;
  const tier = n>=70?"Tier 1":n>=45?"Tier 2":n>=25?"Tier 3":"Archive";
  return <span style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:4,padding:"4px 10px",color,fontWeight:700}}>
    OPI {n} — {tier}
  </span>;
};
