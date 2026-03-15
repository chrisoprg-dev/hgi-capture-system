const { useState, useEffect, useRef } = React;
const GOLD="#C9A84C",GOLD_D="#8B6E2E",BG="#0A0A0A",BG2="#111111",BG3="#191919",BG4="#222222";
const TEXT="#E8E0D0",TEXT_D="#888070",BORDER="#2A2520",RED="#C0392B",GREEN="#27AE60",BLUE="#2980B9",ORANGE="#E67E22";

const HGI_CONTEXT = "Hammerman & Gainer LLC (HGI) — 97 years. Disaster Recovery, CDBG-DR, TPA/Claims, Housing, Construction Management. Past performance: Road Home $12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 20yrs Texas, Restore Louisiana, Terrebonne Parish, Jefferson Parish FEMA PA. Geography: Louisiana, Gulf Coast, Texas.";

// Mobile detection constant
const isMobile = window.innerWidth < 768;

// Global mobile-responsive styles
const globalStyles = `
/* IMPORTANT: Add this viewport meta tag to index.html: 
<meta name="viewport" content="width=device-width, initial-scale=1.0"> */

/* Base styles */
body {
  font-size: 14px;
}

/* Mobile styles for screens under 768px */
@media (max-width: 767px) {
  body {
    font-size: 14px !important;
    min-font-size: 14px;
  }
  
  /* Sidebar collapse to bottom navigation */
  .sidebar {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    height: 60px !important;
    width: 100% !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-around !important;
    align-items: center !important;
    z-index: 1000 !important;
  }
  
  /* Adjust main content for bottom nav */
  .main-content {
    padding-bottom: 80px !important;
  }
  
  /* Stack all grid layouts to single column */
  .grid,
  .dashboard-grid,
  [style*="display: grid"],
  [style*="display:grid"] {
    display: block !important;
    grid-template-columns: 1fr !important;
  }
  
  .grid > *,
  .dashboard-grid > * {
    margin-bottom: 16px !important;
  }
  
  /* Make tables horizontally scrollable */
  table {
    display: block !important;
    overflow-x: auto !important;
    white-space: nowrap !important;
    width: 100% !important;
  }
  
  /* Touch target sizes minimum 44px */
  button,
  .btn,
  a,
  input[type="button"],
  input[type="submit"],
  .touch-target {
    min-height: 44px !important;
    min-width: 44px !important;
    padding: 12px 18px !important;
  }
  
  /* Dashboard stat cards stack vertically */
  .stat-cards,
  .dashboard-stats,
  .stats-grid {
    display: block !important;
  }
  
  .stat-card,
  .dashboard-card {
    width: 100% !important;
    margin-bottom: 12px !important;
  }
  
  /* Full-width buttons on mobile */
  button,
  .btn,
  input[type="button"],
  input[type="submit"] {
    width: 100% !important;
    display: block !important;
    margin-bottom: 8px !important;
  }
  
  /* Button groups */
  .button-group {
    display: block !important;
  }
  
  .button-group button,
  .button-group .btn {
    margin-right: 0 !important;
    margin-bottom: 8px !important;
    border-radius: 4px !important;
  }
  
  /* Form inputs full width */
  input,
  textarea,
  select {
    width: 100% !important;
    box-sizing: border-box !important;
    margin-bottom: 12px !important;
  }
  
  /* Improve spacing on mobile */
  .container,
  .page-container {
    padding: 12px !important;
  }
  
  /* Cards and panels */
  .card,
  .panel {
    margin-bottom: 16px !important;
  }
  
  /* Text readability */
  h1 { font-size: 24px !important; }
  h2 { font-size: 20px !important; }
  h3 { font-size: 18px !important; }
  h4 { font-size: 16px !important; }
  
  /* Navigation adjustments */
  .nav-item {
    padding: 12px 8px !important;
    text-align: center !important;
  }
}
`;

// Inject global styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = globalStyles;
  document.head.appendChild(styleSheet);
}

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
  <div className="card" style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:16,...style}}>{children}</div>
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
  return <button className="btn touch-target" style={{...base,...v[variant]}} onClick={disabled?undefined:onClick}>{children}</button>;
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

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith('# ')) {
      elements.push(React.createElement('div', {key:i,style:{fontSize:18,fontWeight:800,color:GOLD,marginTop:16,marginBottom:8,borderBottom:'1px solid '+GOLD+'33',paddingBottom:6}}, trimmed.slice(2)));
    } else if (trimmed.startsWith('## ')) {
      elements.push(React.createElement('div', {key:i,style:{fontSize:15,fontWeight:700,color:GOLD,marginTop:14,marginBottom:6}}, trimmed.slice(3)));
    } else if (trimmed.startsWith('### ')) {
      elements.push(React.createElement('div', {key:i,style:{fontSize:14,fontWeight:700,color:TEXT,marginTop:10,marginBottom:4}}, trimmed.slice(4)));
    } else if (trimmed.startsWith('---')) {
      elements.push(React.createElement('hr', {key:i,style:{border:'none',borderTop:'1px solid '+BORDER,margin:'12px 0'}}));
    } else if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
      const inner = trimmed.slice(2);
      const boldEnd = inner.indexOf('**', 2);
      if (boldEnd > 2) {
        const boldText = inner.slice(2, boldEnd);
        const rest = inner.slice(boldEnd + 2);
        elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:4,paddingLeft:14,borderLeft:'2px solid '+GOLD+'44'}},
          React.createElement('strong', {style:{color:TEXT}}, boldText), rest));
      } else {
        elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:4,paddingLeft:14,borderLeft:'2px solid '+GOLD+'44'}}, trimmed.slice(2)));
      }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bullet = trimmed.replace(/^[-*•]\s+/, '');
      elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:4,paddingLeft:14,borderLeft:'2px solid '+BORDER}}, bullet));
    } else if (/^\d+[\.\)]\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+[\.\)])\s/)[1];
      const rest = trimmed.slice(num.length + 1);
      const boldMatch = rest.match(/^\*\*(.+?)\*\*(.*)/);
      if (boldMatch) {
        elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:6,paddingLeft:14,borderLeft:'2px solid '+BLUE+'44'}},
          React.createElement('strong', {style:{color:BLUE}}, num + ' ' + boldMatch[1]), boldMatch[2]));
      } else {
        elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:6,paddingLeft:14,borderLeft:'2px solid '+BLUE+'44'}}, num + ' ' + rest));
      }
    } else {
      let processed = trimmed;
      const parts = [];
      let lastIdx = 0;
      const boldRegex = /\*\*(.+?)\*\*/g;
      let match;
      while ((match = boldRegex.exec(processed)) !== null) {
        if (match.index > lastIdx) parts.push(processed.slice(lastIdx, match.index));
        parts.push(React.createElement('strong', {key:'b'+match.index,style:{color:TEXT}}, match[1]));
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < processed.length) parts.push(processed.slice(lastIdx));
      if (parts.length === 0) parts.push(processed);
      elements.push(React.createElement('div', {key:i,style:{fontSize:13,color:TEXT_D,marginBottom:6,lineHeight:1.7}}, ...parts));
    }
    i++;
  }
  return elements;
}

const AIOut = ({content, loading, label="AI ANALYSIS"}) => {
  if (loading) return React.createElement('div', {style:{color:GOLD,fontSize:13,padding:12,background:BG3,borderRadius:4,border:'1px solid '+GOLD+'33',animation:'pulse 1.2s infinite'}}, '⟳ generating ' + label + '...');
  if (!content) return null;
  return React.createElement('div', {style:{background:BG3,border:'1px solid '+GOLD+'33',borderRadius:4,padding:14}},
    React.createElement('div', {style:{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}, label),
    ...renderMarkdown(content)
  );
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

// Export isMobile for use in other components
window.isMobile = isMobile;