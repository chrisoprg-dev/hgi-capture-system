// ── FINANCIAL ANALYSIS & PRICING ─────────────────────────────────────────────
function FinancialPricing({ sharedCtx={} }) {
  const LABOR_CATS = ["Program Manager","Deputy PM","Senior Program Manager","Grant Manager","Senior Analyst","Analyst","Associate Analyst","Data Specialist","GIS Specialist","Field Inspector","Case Manager","Housing Specialist","Financial Analyst","Compliance Officer","Quality Assurance","Administrative Support","IT Specialist","Legal/Policy Advisor","Communications Specialist","Training Coordinator"];
  const [activeTab, setActiveTab] = useState("intelligence");
  const [laborRows, setLaborRows] = useState(() => store.get("laborRows") || [
    {id:1, cat:"Program Manager", hours:2080, rawRate:95, fringe:0.28, overhead:0.15, ga:0.12, fee:0.10},
    {id:2, cat:"Senior Analyst", hours:2080, rawRate:65, fringe:0.28, overhead:0.15, ga:0.12, fee:0.10},
  ]);
  const [odcs, setOdcs] = useState(() => store.get("odcs") || [{id:1,desc:"Travel",amount:25000},{id:2,desc:"Other Direct Costs",amount:10000}]);
  const [periods, setPeriods] = useState(() => store.get("pricePeriods") || [{id:1,label:"Base Year",months:12,escalation:0},{id:2,label:"Option Year 1",months:12,escalation:3},{id:3,label:"Option Year 2",months:12,escalation:3}]);
  const [costNarrative, setCostNarrative] = useState("");
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [scenario, setScenario] = useState({feeAdj:0, laborAdj:0, hoursAdj:0});

  // Price Intelligence Engine state
  const [intel, setIntel] = useState(() => store.get("priceIntel") || {
    contractType:"best_value", setAside:"none", pricingWeight:30,
    incumbent:"", incumbentAdvantage:"unknown",
    competitors:"ICF, Hagerty, Witt O'Brien's, Dewberry",
    estimatedValue:"", geography:"Louisiana", contractYears:"3",
    hgiMarginTarget:12, hgiIncumbent:false,
    evaluationModel:"best_value", protestRisk:"low"
  });
  const [ptwAnalysis, setPtwAnalysis] = useState(() => store.get("ptwAnalysis") || "");
  const [ptwLoading, setPtwLoading] = useState(false);
  const [marketRates, setMarketRates] = useState(() => store.get("marketRates") || "");
  const [marketLoading, setMarketLoading] = useState(false);
  const [evalModel, setEvalModel] = useState(() => store.get("evalModel") || {priceWeight:30, techWeight:40, pastPerfWeight:20, managementWeight:10});
  const [evalResult, setEvalResult] = useState(() => store.get("evalResult") || "");
  const [evalLoading, setEvalLoading] = useState(false);
  const [recommendedPrice, setRecommendedPrice] = useState(() => store.get("recommendedPrice") || null);

  var pl = usePipeline(); var plOpps = pl.pipeline; var plSelected = pl.selected; var plSelect = pl.select; var plLoading = pl.loading;
  const saveIntel = (u) => { const n={...intel,...u}; setIntel(n); store.set("priceIntel",n); };
  const saveLR = (rows) => { setLaborRows(rows); store.set("laborRows", rows); };
  const saveODC = (rows) => { setOdcs(rows); store.set("odcs", rows); };
  const savePeriods = (rows) => { setPeriods(rows); store.set("pricePeriods", rows); };

  // AI-powered full extraction — Claude reads the decomposition and returns structured data
  const [autoPopulating, setAutoPopulating] = useState(false);

  const autoPopulateFromSystem = async (force=false) => {
    const decomp = sharedCtx.decomposition || "";
    const brief = sharedCtx.execBrief || "";
    const research = sharedCtx.research || "";
    const wfState = store.get("wfState") || {};

    if (!decomp && !brief) return 0;

    setAutoPopulating(true);

    try {
      // Use Claude to extract ALL structured data from the decomposition
      const extractionPrompt = "Extract ALL pricing and staffing data from this RFP decomposition. Return ONLY a valid JSON object, no markdown, no explanation.\n\nReturn this exact structure:\n{\n  \"estimatedValue\": \"string — contract value as written\",\n  \"geography\": \"string — place of performance\",\n  \"contractYears\": \"string — e.g. 1 base + 2 options\",\n  \"baseYears\": number,\n  \"optionYears\": number,\n  \"contractType\": \"best_value|lpta|ffp|t_and_m|cost_plus\",\n  \"setAside\": \"none|8a|sdvosb|hubzone|wosb|sb\",\n  \"pricingWeight\": number,\n  \"techWeight\": number,\n  \"pastPerfWeight\": number,\n  \"managementWeight\": number,\n  \"incumbent\": \"string or empty\",\n  \"incumbentAdvantage\": \"unknown|strong|moderate|weak|none\",\n  \"hasFieldWork\": boolean,\n  \"hasTeaming\": boolean,\n  \"travelRequired\": boolean,\n  \"laborRoles\": [\n    {\n      \"role\": \"exact role title from RFP\",\n      \"quantity\": number,\n      \"hoursPerYear\": number,\n      \"seniorityLevel\": \"senior|mid|junior|admin\",\n      \"requiredCerts\": \"string or empty\"\n    }\n  ],\n  \"odcItems\": [\n    {\"description\": \"string\", \"estimatedAmount\": number}\n  ],\n  \"competitors\": [\"list of firms likely to bid based on contract type and geography\"]\n}\n\nFor laborRoles: extract EVERY role mentioned in key personnel, staffing, or requirements sections. If quantity not specified assume 1. For hoursPerYear: full time = 2080, part time = 1040, as needed = 520.\n\nFor odcItems: include travel, equipment, subcontracts, printing, IT, training — estimate amounts based on contract size and type.\n\nRFP DECOMPOSITION:\n" + decomp.slice(0,3000) + "\n\nEXECUTIVE BRIEF:\n" + brief.slice(0,800) + "\n\nRESEARCH:\n" + research.slice(0,500);

      const raw = await callClaude(extractionPrompt, "You are a government contract analyst. Return ONLY valid JSON. No markdown, no explanation, no backticks.", 2000);

      // Parse the JSON response
      let data;
      try {
        const clean = raw.replace(/```json|```/g,"").trim();
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        data = JSON.parse(clean.slice(start, end+1));
      } catch(e) {
        setAutoPopulating(false);
        alert("Could not parse extraction response. Try again.");
        return 0;
      }

      let populated = 0;

      // ── Update Price Intelligence fields ──
      const intelUpdates = {};
      if (data.estimatedValue) { intelUpdates.estimatedValue = data.estimatedValue; populated++; }
      if (data.geography) { intelUpdates.geography = data.geography; populated++; }
      if (data.contractYears) { intelUpdates.contractYears = data.contractYears; populated++; }
      if (data.contractType) { intelUpdates.contractType = data.contractType; populated++; }
      if (data.setAside) { intelUpdates.setAside = data.setAside; populated++; }
      if (data.pricingWeight) { intelUpdates.pricingWeight = data.pricingWeight; populated++; }
      if (data.incumbent !== undefined) { intelUpdates.incumbent = data.incumbent; populated++; }
      if (data.incumbentAdvantage) { intelUpdates.incumbentAdvantage = data.incumbentAdvantage; populated++; }
      if (data.competitors && data.competitors.length > 0) {
        // Also add any from research text scan
        const competitorList = ["ICF","Hagerty","Witt O'Brien's","Dewberry","Guidehouse","Tetra Tech","LPA Group","Sikich","Cloudburst","IEM","CDM Smith","Booz Allen","Leidos","Baker Tilly","RSM"];
        const allText = decomp + " " + brief + " " + research;
        const foundExtra = competitorList.filter(c => allText.toLowerCase().includes(c.toLowerCase()) && !data.competitors.some(dc => dc.toLowerCase().includes(c.toLowerCase())));
        intelUpdates.competitors = [...new Set([...data.competitors, ...foundExtra])].join(", ");
        populated++;
      }
      if (Object.keys(intelUpdates).length) saveIntel(intelUpdates);

      // ── Update Eval Score Model weights ──
      if (data.pricingWeight || data.techWeight || data.pastPerfWeight || data.managementWeight) {
        const newEval = {...evalModel};
        if (data.pricingWeight) newEval.priceWeight = data.pricingWeight;
        if (data.techWeight) newEval.techWeight = data.techWeight;
        if (data.pastPerfWeight) newEval.pastPerfWeight = data.pastPerfWeight;
        if (data.managementWeight) newEval.managementWeight = data.managementWeight;
        // If weights don't sum to 100, normalize
        const sum = newEval.priceWeight + newEval.techWeight + newEval.pastPerfWeight + newEval.managementWeight;
        if (sum > 0 && sum !== 100) {
          newEval.priceWeight = Math.round(newEval.priceWeight / sum * 100);
          newEval.techWeight = Math.round(newEval.techWeight / sum * 100);
          newEval.pastPerfWeight = Math.round(newEval.pastPerfWeight / sum * 100);
          newEval.managementWeight = 100 - newEval.priceWeight - newEval.techWeight - newEval.pastPerfWeight;
        }
        setEvalModel(newEval);
        store.set("evalModel", newEval);
        populated++;
      }

      // ── Build Period Pricing from contract structure ──
      const baseYrs = data.baseYears || 1;
      const optYrs = data.optionYears || 2;
      const newPeriods = [{id:1, label:"Base Year", months:12, escalation:0}];
      for (let i=1; i<=optYrs; i++) {
        newPeriods.push({id:i+1, label:"Option Year "+i, months:12, escalation:3});
      }
      savePeriods(newPeriods);
      populated++;

      // ── Build Labor Rows from extracted roles ──
      const roleRates = {
        "senior": {rawRate:110, fringe:0.28, overhead:0.15, ga:0.12, fee:0.10},
        "mid":    {rawRate:75,  fringe:0.28, overhead:0.15, ga:0.12, fee:0.10},
        "junior": {rawRate:55,  fringe:0.28, overhead:0.15, ga:0.12, fee:0.09},
        "admin":  {rawRate:38,  fringe:0.28, overhead:0.15, ga:0.12, fee:0.08},
      };
      // Role-specific rate overrides
      const roleOverrides = {
        "program manager": {rawRate:120, seniority:"senior"},
        "deputy program manager": {rawRate:100, seniority:"senior"},
        "deputy pm": {rawRate:100, seniority:"senior"},
        "senior program manager": {rawRate:130, seniority:"senior"},
        "project manager": {rawRate:105, seniority:"senior"},
        "grant manager": {rawRate:90, seniority:"senior"},
        "senior grant manager": {rawRate:100, seniority:"senior"},
        "financial analyst": {rawRate:80, seniority:"mid"},
        "senior financial analyst": {rawRate:95, seniority:"senior"},
        "compliance officer": {rawRate:85, seniority:"mid"},
        "compliance manager": {rawRate:95, seniority:"senior"},
        "data specialist": {rawRate:68, seniority:"mid"},
        "gis specialist": {rawRate:70, seniority:"mid"},
        "it specialist": {rawRate:75, seniority:"mid"},
        "field inspector": {rawRate:55, seniority:"junior"},
        "case manager": {rawRate:58, seniority:"junior"},
        "housing specialist": {rawRate:68, seniority:"mid"},
        "quality assurance": {rawRate:75, seniority:"mid"},
        "quality control": {rawRate:75, seniority:"mid"},
        "training coordinator": {rawRate:62, seniority:"mid"},
        "communications specialist": {rawRate:65, seniority:"mid"},
        "administrative support": {rawRate:40, seniority:"admin"},
        "administrative assistant": {rawRate:38, seniority:"admin"},
        "legal advisor": {rawRate:120, seniority:"senior"},
        "policy advisor": {rawRate:110, seniority:"senior"},
      };

      if (data.laborRoles && data.laborRoles.length > 0) {
        const newLaborRows = [];
        data.laborRoles.forEach((role, idx) => {
          const roleKey = (role.role||"").toLowerCase();
          const override = Object.entries(roleOverrides).find(([k]) => roleKey.includes(k));
          const seniority = override?.[1]?.seniority || role.seniorityLevel || "mid";
          const baseRates = roleRates[seniority] || roleRates["mid"];
          const rawRate = override?.[1]?.rawRate || baseRates.rawRate;
          const qty = role.quantity || 1;
          const hoursPerPerson = role.hoursPerYear || 2080;

          for (let q=0; q<Math.min(qty,3); q++) {
            newLaborRows.push({
              id: Date.now() + idx*10 + q,
              cat: role.role || "Analyst",
              hours: hoursPerPerson,
              rawRate,
              fringe: baseRates.fringe,
              overhead: baseRates.overhead,
              ga: baseRates.ga,
              fee: baseRates.fee
            });
          }
        });

        // Ensure PM is always first
        const pmIdx = newLaborRows.findIndex(r => r.cat.toLowerCase().includes("program manager"));
        if (pmIdx > 0) { const pm = newLaborRows.splice(pmIdx,1)[0]; newLaborRows.unshift(pm); }
        if (newLaborRows.length > 0) { saveLR(newLaborRows); populated++; }
      }

      // ── Build ODCs from extracted items ──
      if (data.odcItems && data.odcItems.length > 0) {
        const newODCs = data.odcItems.map((item, idx) => ({
          id: idx+1,
          desc: item.description,
          amount: item.estimatedAmount || 0
        }));
        saveODC(newODCs);
        populated++;
      } else {
        // Fallback ODC logic
        const travelAmt = data.travelRequired ? (data.hasFieldWork ? 75000 : 35000) : 25000;
        const newODCs = [{id:1, desc:"Travel & Transportation", amount:travelAmt}, {id:2, desc:"Other Direct Costs", amount:15000}];
        if (data.hasTeaming) newODCs.push({id:3, desc:"Subcontractor Support", amount:100000});
        saveODC(newODCs);
        populated++;
      }

      setAutoPopulating(false);
      return populated;

    } catch(err) {
      setAutoPopulating(false);
      console.error("Auto-populate error:", err);
      return 0;
    }
  };

  // Auto-populate on mount when data is available
  useEffect(() => {
    if (sharedCtx.decomposition && !autoPopulating) {
      autoPopulateFromSystem(false);
    }
  }, [sharedCtx.decomposition, sharedCtx.execBrief, sharedCtx.research]);

  const calcRow = (r, feeAdj=0, laborAdj=0, hoursAdj=0) => {
    const raw = parseFloat(r.rawRate||0) * (1 + laborAdj/100);
    const fringe = raw * parseFloat(r.fringe||0);
    const overhead = (raw + fringe) * parseFloat(r.overhead||0);
    const ga = (raw + fringe + overhead) * parseFloat(r.ga||0);
    const cost = raw + fringe + overhead + ga;
    const feeRate = parseFloat(r.fee||0) + feeAdj/100;
    const loaded = cost * (1 + feeRate);
    const hours = parseFloat(r.hours||0) * (1 + hoursAdj/100);
    return { raw, fringe, overhead, ga, cost, loaded, hours, total: loaded * hours };
  };

  const totalLabor = (feeAdj=0, laborAdj=0, hoursAdj=0) =>
    laborRows.reduce((sum, r) => sum + calcRow(r, feeAdj, laborAdj, hoursAdj).total, 0);
  const totalODC = () => odcs.reduce((sum, o) => sum + parseFloat(o.amount||0), 0);
  const fmt = (n) => "$" + Math.round(n).toLocaleString();
  const periodTotal = (p, idx) => {
    const esc = Math.pow(1 + (parseFloat(p.escalation||0)/100), idx);
    return (totalLabor() * esc + totalODC()) * (parseFloat(p.months||12)/12);
  };
  const contractTotal = () => periods.reduce((sum, p, i) => sum + periodTotal(p, i), 0);
  const profitMargin = () => {
    const t = totalLabor();
    const cost = laborRows.reduce((sum, r) => sum + calcRow(r).cost * calcRow(r).hours, 0);
    return t > 0 ? ((t - cost) / t * 100).toFixed(1) : 0;
  };

  const runMarketRates = async () => {
    setMarketLoading(true);
    const decomp = sharedCtx.decomposition ? sharedCtx.decomposition.slice(0,1200) : "";
    const research = sharedCtx.research ? sharedCtx.research.slice(0,1000) : "";
    const brief = sharedCtx.execBrief ? sharedCtx.execBrief.slice(0,600) : "";
    const roles = laborRows.map(r => r.cat).join(", ");
    const prompt = "You are a government contract pricing expert. Analyze current market labor rates for this specific opportunity.\n\nOPPORTUNITY: " + (sharedCtx.title||"Disaster Recovery Grant Management") + "\nAGENCY: " + (sharedCtx.agency||"Louisiana State Agency") + "\nGEOGRAPHY: " + intel.geography + "\nCONTRACT TYPE: " + intel.contractType + "\nSET-ASIDE: " + intel.setAside + "\nESTIMATED VALUE: " + intel.estimatedValue + "\nCONTRACT YEARS: " + intel.contractYears + "\nKNOWN COMPETITORS: " + intel.competitors + "\nINCUMBENT: " + (intel.incumbent||"Unknown") + "\nROLES NEEDED: " + roles + "\n\nRFP DECOMPOSITION:\n" + decomp + "\n\nCOMPETITIVE RESEARCH:\n" + research + "\n\nEXECUTIVE BRIEF CONTEXT:\n" + brief + "\n\nUsing ALL of the above context, provide:\n1. MARKET RATE ANALYSIS — for each role: GSA Schedule range, competitive market range, Louisiana/Gulf Coast locality adjustment, recommended raw rate for HGI\n2. COMPETITOR INDIRECT RATES — based on research intel, model the likely fringe/OH/G&A/fee structure for each identified competitor\n3. GEOGRAPHY & LOCALITY FACTORS — how this specific geography and agency affect rates\n4. SET-ASIDE IMPACT — how " + intel.setAside + " status reshapes the bidder pool\n5. INCUMBENT RATE ADVANTAGE — how " + (intel.incumbent||"the incumbent") + " likely prices given their position\n6. RATE RED FLAGS — specific rates that raise evaluator concerns for this contract type\n7. HGI RATE POSITIONING — exactly where HGI should land on each role to be competitive AND credible";
    const result = await callClaude(prompt, "You are a senior pricing strategist specializing in government disaster recovery and grants management contracts. Be specific with dollar figures. Reference the research data provided. " + HGI_CONTEXT, 4000);
    setMarketRates(result);
    store.set("marketRates", result);
    setMarketLoading(false);
  };

  const runPTW = async () => {
    setPtwLoading(true);
    const hgiCost = fmt(contractTotal() || totalLabor() + totalODC());
    const decomp = sharedCtx.decomposition ? sharedCtx.decomposition.slice(0,1000) : "";
    const execBrief = sharedCtx.execBrief ? sharedCtx.execBrief.slice(0,800) : "";
    const research = sharedCtx.research ? sharedCtx.research.slice(0,1000) : "";
    const marketContext = marketRates ? "\n\nMARKET RATE ANALYSIS (already completed):\n" + marketRates.slice(0,800) : "";
    const prompt = "You are a Price-to-Win expert. Build a comprehensive PTW analysis using ALL available intelligence for this specific opportunity.\n\nOPPORTUNITY: " + (sharedCtx.title||"Disaster Recovery Grant Management") + "\nAGENCY: " + (sharedCtx.agency||"Louisiana Agency") + "\nESTIMATED VALUE: " + intel.estimatedValue + "\nGEOGRAPHY: " + intel.geography + "\nCONTRACT YEARS: " + intel.contractYears + "\nCONTRACT TYPE: " + intel.contractType + "\nEVALUATION MODEL: " + intel.evaluationModel + "\nPRICE WEIGHT: " + evalModel.priceWeight + "%\nSET-ASIDE: " + intel.setAside + "\nINCUMBENT: " + (intel.incumbent||"Unknown") + "\nINCUMBENT ADVANTAGE: " + intel.incumbentAdvantage + "\nHGI IS INCUMBENT: " + intel.hgiIncumbent + "\nIDENTIFIED COMPETITORS: " + intel.competitors + "\nHGI TARGET MARGIN: " + intel.hgiMarginTarget + "%\nHGI CURRENT COST BUILDUP: " + hgiCost + "\nPROTEST RISK TOLERANCE: " + intel.protestRisk + "\n\nRFP DECOMPOSITION:\n" + decomp + "\n\nEXECUTIVE BRIEF:\n" + execBrief + "\n\nCOMPETITIVE RESEARCH INTEL:\n" + research + marketContext + "\n\nUsing ALL of the above intelligence, provide a COMPLETE Price-to-Win analysis:\n\n## 1. LIKELY BIDDER POOL\nBased on research and contract characteristics, identify ALL likely bidders for THIS specific opportunity (not generic — use the research data to determine who is active in this market, this agency, and this contract type). Include small businesses if set-aside applies.\n\n## 2. COMPETITOR-BY-COMPETITOR PRICING MODEL\nFor each likely bidder: estimated bid range, known indirect rate structure, incumbent/relationship advantage, likely pricing strategy, and HGI head-to-head assessment\n\n## 3. INCUMBENT ANALYSIS\nDetailed analysis of " + (intel.incumbent||"the incumbent") + ": pricing advantage, re-bid strategy, relationship equity, agency satisfaction signals from research\n\n## 4. EVALUATION SCORE MODELING\nWith price weighted at " + evalModel.priceWeight + "%:\n- Show HGI's evaluated score at aggressive / value / premium price points\n- Model competitor evaluated scores\n- Identify the price crossover point where HGI wins on total evaluated score\n\n## 5. PRICE SENSITIVITY ANALYSIS\n- Impact of each $100K change on win probability\n- Price floor (protest risk threshold)\n- Price ceiling (losing on price to competitors)\n\n## 6. HGI WIN PRICE RECOMMENDATION\nThree specific dollar scenarios:\n- AGGRESSIVE: exact price, win probability %, margin %, risk\n- VALUE: exact price, win probability %, margin % — RECOMMENDED\n- PREMIUM: exact price, win probability %, justification required\n\n## 7. PRICING STRATEGY NARRATIVE\nThe specific strategy HGI should execute, referencing HGI's past performance advantages (Road Home, BP GCCF, Jefferson Parish) as justification for premium positioning if applicable\n\n## 8. RED FLAGS & RISKS";
    const result = await callClaude(prompt, "You are a senior PTW analyst with 20 years in government contracting. Be specific with dollar amounts, percentages, and competitor names. Use all research data provided. " + HGI_CONTEXT, 4000);
    setPtwAnalysis(result);
    store.set("ptwAnalysis", result);

    // Extract recommended price
    const priceMatch = result.match(/VALUE[^$]*\$([\d,]+)/i);
    if (priceMatch) {
      const p = parseInt(priceMatch[1].replace(/,/g,""));
      if (p > 100000) { setRecommendedPrice(p); store.set("recommendedPrice", p); }
    }
    setPtwLoading(false);
  };

  const runEvalModel = async () => {
    setEvalLoading(true);
    const total = evalModel.priceWeight + evalModel.techWeight + evalModel.pastPerfWeight + evalModel.managementWeight;
    const prompt = "Model the evaluation scoring for HGI on this opportunity.\n\nEVALUATION CRITERIA WEIGHTS:\nPrice: " + evalModel.priceWeight + "%\nTechnical: " + evalModel.techWeight + "%\nPast Performance: " + evalModel.pastPerfWeight + "%\nManagement: " + evalModel.managementWeight + "%" + (total !== 100 ? "\nNOTE: weights sum to " + total + "% — adjust analysis accordingly" : "") + "\n\nOPPORTUNITY: " + (sharedCtx.title||"Disaster Recovery") + "\nAGENCY: " + (sharedCtx.agency||"Louisiana Agency") + "\nHGI COST BUILDUP: " + fmt(contractTotal()) + "\nCOMPETITORS: " + intel.competitors + "\n\nProvide:\n1. TECHNICAL SCORE — HGI likely score (0-100) with reasoning based on our past performance\n2. PAST PERFORMANCE SCORE — HGI likely score with reasoning (Road Home, BP, PBGC, Jefferson Parish)\n3. MANAGEMENT SCORE — HGI likely score with reasoning\n4. PRICE SCORING — how price is typically scored (lowest price gets 100, others scored proportionally)\n5. TOTAL EVALUATED SCORE — HGI's projected total vs competitors at each price scenario\n6. SWING ANALYSIS — which evaluation factor has the most impact on HGI's win probability\n7. RECOMMENDATIONS — specific actions to improve each score before submission";
    const result = await callClaude(prompt, "You are a government proposal evaluator and capture strategist. " + HGI_CONTEXT, 3000);
    setEvalResult(result);
    store.set("evalResult", result);
    setEvalLoading(false);
  };

  const generateNarrative = async () => {
    setNarrativeLoading(true);
    const ptwContext = ptwAnalysis ? "\n\nPTW ANALYSIS CONTEXT:\n" + ptwAnalysis.slice(0,600) : "";
    const txt = await callClaude(
      "Write a professional, submission-ready Cost Proposal Narrative for HGI.\n\nCONTRACT: " + (sharedCtx.title||"Disaster Recovery Grant Management") + "\nAGENCY: " + (sharedCtx.agency||"Louisiana Agency") + "\nTotal Contract Value: " + fmt(contractTotal()) + "\nBase Year: " + fmt(periodTotal(periods[0],0)) + "\nContract Type: " + intel.contractType + "\nLabor Categories: " + laborRows.map(r => r.cat + " — " + fmt(calcRow(r).total)).join(", ") + "\nODCs: " + fmt(totalODC()) + "\nProfit Margin: " + profitMargin() + "%\nGeography: " + intel.geography + ptwContext + "\n\nWrite a complete cost narrative (800+ words) covering:\n1. Pricing Methodology\n2. Labor Rate Justification — reference GSA schedules and market comparables\n3. Indirect Rate Explanation and reasonableness\n4. ODC Justification\n5. Cost Realism — why HGI's price is realistic and deliverable\n6. Value Proposition — what the agency gets for this price\n7. Fee Reasonableness\n\nTone: professional government proposal. Do not use placeholders.",
      "You are a cost proposal writer specializing in disaster recovery government contracts. " + HGI_CONTEXT, 3000
    );
    setCostNarrative(txt);
    setNarrativeLoading(false);
  };

  const exportFinancialPackage = async () => {
    const hasContent = marketRates || ptwAnalysis || evalResult || costNarrative;
    if (!hasContent) { alert('Generate at least one analysis first (Market Rates, PTW, Eval, or Narrative).'); return; }
    const cs = String.fromCharCode(36);
    const f2 = function(n) { return cs + Math.round(n).toLocaleString(); };
    const agencyVal = (plSelected ? plSelected.agency : '') || intel.geography || 'HGI';
    const titleVal = (plSelected ? plSelected.title : '') || 'Financial Analysis';
    const laborLines = laborRows.map(function(r) { var c = calcRow(r); return '- ' + r.cat + ': ' + r.hours + ' hrs = ' + f2(c.total); }).join('\n');
    const odcLines = odcs.map(function(o) { return '- ' + o.desc + ': ' + f2(parseFloat(o.amount||0)); }).join('\n');
    const periodLines = periods.map(function(p, i) { return '- ' + p.label + ': ' + f2(periodTotal(p, i)); }).join('\n');
    var bodyParts = ['## COST BUILDUP SUMMARY', '', '### Labor', laborLines, '', 'Total Labor: ' + f2(totalLabor()), '', '### ODCs', odcLines, '', 'Total ODCs: ' + f2(totalODC()), '', '### Period Pricing', periodLines, '', 'Contract Total: ' + f2(contractTotal()), 'Profit Margin: ' + profitMargin() + '%', recommendedPrice ? 'Win Price: ' + f2(recommendedPrice) : ''];
    if (marketRates) { bodyParts.push(''); bodyParts.push('## MARKET RATE ANALYSIS'); bodyParts.push(marketRates); }
    if (ptwAnalysis) { bodyParts.push(''); bodyParts.push('## PRICE-TO-WIN ANALYSIS'); bodyParts.push(ptwAnalysis); }
    if (evalResult) { bodyParts.push(''); bodyParts.push('## EVALUATION SCORE MODEL'); bodyParts.push(evalResult); }
    if (costNarrative) { bodyParts.push(''); bodyParts.push('## COST PROPOSAL NARRATIVE'); bodyParts.push(costNarrative); }
    var fullContent = bodyParts.join('\n');
    var sections = [marketRates && 'Market Rates', ptwAnalysis && 'PTW', evalResult && 'Eval Model', costNarrative && 'Narrative'].filter(Boolean).join(', ') || 'Buildup only';
    try {
      var resp = await fetch('/api/export-module', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: 'financial', title: titleVal, agency: agencyVal, content: fullContent, metadata: { Agency: agencyVal, 'Contract Value': intel.estimatedValue || f2(contractTotal()), 'Contract Type': intel.contractType || '', Incumbent: intel.incumbent || 'Unknown', 'Sections': sections } }) });
      if (!resp.ok) throw new Error('Export failed');
      var blob = await resp.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'HGI_Financial_' + agencyVal.replace(/[^a-zA-Z0-9]/g,'_') + '.docx'; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert('Export failed: ' + e.message); }
  };

  const addLaborRow = () => saveLR([...laborRows, {id:Date.now(), cat:"Analyst", hours:2080, rawRate:60, fringe:0.28, overhead:0.15, ga:0.12, fee:0.10}]);
  const updateLR = (id, field, val) => saveLR(laborRows.map(r => r.id===id ? {...r,[field]:val} : r));
  const removeLR = (id) => saveLR(laborRows.filter(r => r.id!==id));

  const TABS = [
    {id:"intelligence",label:"⚡ Price Intelligence"},
    {id:"buildup",label:"Cost Buildup"},
    {id:"periods",label:"Period Pricing"},
    {id:"evaluation",label:"Eval Score Model"},
    {id:"scenario",label:"Scenario Modeling"},
    {id:"narrative",label:"Cost Narrative"},
  ];

  return (
    <div>
      <div style={{marginBottom:4}}>
        <h2 style={{color:GOLD,margin:0,fontSize:20,fontWeight:800}}>Financial Analysis & Pricing</h2>
        <p style={{color:TEXT_D,margin:"4px 0 0",fontSize:12}}>Price Intelligence Engine · Cost Buildup · PTW · Evaluation Modeling · Cost Narrative</p>
      </div>

      {sharedCtx.title && (
        <div style={{marginBottom:12,padding:"8px 12px",background:GREEN+"15",border:`1px solid ${GREEN}44`,borderRadius:4,fontSize:12,color:GREEN}}>
          ✓ Loaded: <strong>{sharedCtx.title}</strong>{sharedCtx.agency ? " — " + sharedCtx.agency : ""}
          {intel.estimatedValue ? <span style={{marginLeft:12,color:GOLD}}>Est. Value: {intel.estimatedValue}</span> : ""}
        </div>
      )}

      {/* Live Summary Stats — clickable drill-downs */}
      {(()=>{
        const laborBreakdown = laborRows.map(r => { const c=calcRow(r); return {...r, ...c}; });
        const odcTotal = totalODC();
        const laborTotal = totalLabor();
        const baseYearTotal = periodTotal(periods[0]||{months:12,escalation:0}, 0);
        const contractTotalAmt = contractTotal();
        const marginPct = profitMargin();
        const marginColor = parseFloat(marginPct) >= intel.hgiMarginTarget ? GREEN : parseFloat(marginPct) >= intel.hgiMarginTarget * 0.7 ? ORANGE : RED;
        const totalCost = laborRows.reduce((s,r)=>s+calcRow(r).cost*calcRow(r).hours,0) + odcTotal;
        const totalFee = laborTotal - laborRows.reduce((s,r)=>s+calcRow(r).cost*calcRow(r).hours,0);

        return (
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
              {[
                {label:"BASE YEAR", value:fmt(baseYearTotal), color:GOLD, tab:"periods",
                  detail: periods[0] ? "Labor: " + fmt(totalLabor()) + " · ODCs: " + fmt(odcTotal) + " · " + (periods[0].months||12) + " months" : ""},
                {label:"CONTRACT TOTAL", value:fmt(contractTotalAmt), color:GREEN, tab:"periods",
                  detail: periods.map((p,i)=>p.label+": "+fmt(periodTotal(p,i))).join(" · ")},
                {label:"PROFIT MARGIN", value:marginPct+"%", color:marginColor, tab:"buildup",
                  detail: "Target: "+intel.hgiMarginTarget+"% · Fee earned: "+fmt(totalFee) + " · Cost base: "+fmt(totalCost)},
                {label:"LABOR TOTAL", value:fmt(laborTotal), color:TEXT, tab:"buildup",
                  detail: laborRows.map(r=>r.cat+": "+fmt(calcRow(r).total)).join(" · ")},
                {label:"ODCs", value:fmt(odcTotal), color:TEXT, tab:"buildup",
                  detail: odcs.map(o=>o.desc+": "+fmt(parseFloat(o.amount||0))).join(" · ")},
                {label:"WIN PRICE", value:recommendedPrice ? fmt(recommendedPrice) : "Run PTW →", color:recommendedPrice?BLUE:TEXT_D, tab:"intelligence",
                  detail: recommendedPrice ? "Gap to buildup: "+fmt(recommendedPrice-contractTotalAmt) : "Click Price Intelligence → Run PTW Analysis"},
              ].map(stat => (
                <div key={stat.label} onClick={()=>setActiveTab(stat.tab)} style={{
                  background:BG2, border:`1px solid ${activeTab===stat.tab?stat.color:BORDER}`,
                  borderRadius:6, padding:"10px 14px", flex:1, minWidth:120,
                  cursor:"pointer", transition:"border-color 0.15s",
                  borderBottom:`3px solid ${stat.color}44`
                }}>
                  <div style={{fontSize:17,fontWeight:800,color:stat.color,marginBottom:2}}>{stat.value}</div>
                  <div style={{fontSize:9,color:TEXT_D,letterSpacing:"0.08em",marginBottom:4,fontWeight:700}}>{stat.label}</div>
                  {stat.detail && <div style={{fontSize:10,color:TEXT_D,lineHeight:1.4,borderTop:`1px solid ${BORDER}`,paddingTop:4,marginTop:2}}>{stat.detail}</div>}
                </div>
              ))}
            </div>
            {/* Visual cost stack bar */}
            {contractTotalAmt > 0 && (
              <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:6,padding:"10px 14px"}}>
                <div style={{fontSize:10,color:TEXT_D,fontWeight:700,letterSpacing:"0.08em",marginBottom:6}}>COST COMPOSITION — {fmt(contractTotalAmt)} total</div>
                <div style={{display:"flex",height:14,borderRadius:3,overflow:"hidden",marginBottom:6}}>
                  <div style={{width:(laborTotal/contractTotalAmt*100)+"%",background:GOLD,transition:"width 0.3s"}} title={"Labor: "+fmt(laborTotal)} />
                  <div style={{width:(odcTotal/contractTotalAmt*100)+"%",background:BLUE,transition:"width 0.3s"}} title={"ODCs: "+fmt(odcTotal)} />
                  <div style={{width:(totalFee/contractTotalAmt*100)+"%",background:GREEN,transition:"width 0.3s"}} title={"Fee: "+fmt(totalFee)} />
                </div>
                <div style={{display:"flex",gap:16,fontSize:10,color:TEXT_D}}>
                  <span><span style={{color:GOLD}}>■</span> Labor {(laborTotal/contractTotalAmt*100).toFixed(0)}% — {fmt(laborTotal)}</span>
                  <span><span style={{color:BLUE}}>■</span> ODCs {(odcTotal/contractTotalAmt*100).toFixed(0)}% — {fmt(odcTotal)}</span>
                  <span><span style={{color:GREEN}}>■</span> Fee {(totalFee/contractTotalAmt*100).toFixed(0)}% — {fmt(totalFee)}</span>
                  {recommendedPrice && <span style={{marginLeft:"auto",color:BLUE,fontWeight:700}}>PTW Gap: {fmt(recommendedPrice-contractTotalAmt)}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:`1px solid ${BORDER}`,paddingBottom:8,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"6px 14px",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit",border:"none",background:activeTab===t.id?GOLD:BG3,color:activeTab===t.id?"#000":TEXT_D,fontWeight:activeTab===t.id?700:400}}>{t.label}</button>
        ))}
      </div>

      {/* ── PRICE INTELLIGENCE ENGINE ── */}
      {activeTab === "intelligence" && (
        <div>
          <Card style={{marginBottom:16,border:`1px solid ${GOLD}44`}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{color:GOLD,fontWeight:700,fontSize:14,marginBottom:4}}>PRICE INTELLIGENCE ENGINE</div>
                <div style={{color:TEXT_D,fontSize:12}}>All fields auto-populated from your RFP decomposition, executive brief, and research. Override any field manually.</div>
              </div>
              <Btn small onClick={async()=>{const ct=await autoPopulateFromSystem(true);alert("✓ Auto-populated " + ct + " fields from system data");}} disabled={autoPopulating} variant="ghost">{autoPopulating?"⟳ Analyzing RFP...":"⟳ Re-populate from System Data"}</Btn>
            </div>
            <div style={{marginBottom:16,padding:"6px 10px",background:GREEN+"11",border:`1px solid ${GREEN}33`,borderRadius:4,fontSize:11,color:GREEN}}>
              ✓ Auto-populated from: RFP Decomposition · Executive Brief · Research & Analysis · Workflow State
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
              <div>
                <Label text="CONTRACT TYPE" />
                <Sel value={intel.contractType} onChange={v=>saveIntel({contractType:v})} options={[
                  {value:"best_value",label:"Best Value — Tradeoff"},
                  {value:"lpta",label:"LPTA — Lowest Price Technically Acceptable"},
                  {value:"ssa",label:"Source Selection — Subjective"},
                  {value:"ffp",label:"Firm Fixed Price"},
                  {value:"t_and_m",label:"Time & Materials"},
                  {value:"cost_plus",label:"Cost Plus Fixed Fee"},
                ]} style={{width:"100%"}} />
              </div>
              <div>
                <Label text="SET-ASIDE STATUS" />
                <Sel value={intel.setAside} onChange={v=>saveIntel({setAside:v})} options={[
                  {value:"none",label:"Full & Open Competition"},
                  {value:"8a",label:"8(a) Set-Aside"},
                  {value:"sdvosb",label:"SDVOSB Set-Aside"},
                  {value:"hubzone",label:"HUBZone Set-Aside"},
                  {value:"wosb",label:"WOSB Set-Aside"},
                  {value:"sb",label:"Small Business Set-Aside"},
                ]} style={{width:"100%"}} />
              </div>
              <div>
                <Label text="PRICE WEIGHT IN EVALUATION (%)" />
                <Input value={intel.pricingWeight} onChange={v=>saveIntel({pricingWeight:v})} placeholder="e.g. 30" />
              </div>
              <div>
                <Label text="ESTIMATED CONTRACT VALUE" />
                <Input value={intel.estimatedValue} onChange={v=>saveIntel({estimatedValue:v})} placeholder="e.g. $8,500,000" />
              </div>
              <div>
                <Label text="CONTRACT YEARS" />
                <Input value={intel.contractYears} onChange={v=>saveIntel({contractYears:v})} placeholder="e.g. 3 (1 base + 2 options)" />
              </div>
              <div>
                <Label text="GEOGRAPHY / LOCALITY" />
                <Input value={intel.geography} onChange={v=>saveIntel({geography:v})} placeholder="e.g. Louisiana, Baton Rouge" />
              </div>
              <div>
                <Label text="KNOWN INCUMBENT" />
                <Input value={intel.incumbent} onChange={v=>saveIntel({incumbent:v})} placeholder="ICF / None / Unknown" />
              </div>
              <div>
                <Label text="INCUMBENT ADVANTAGE" />
                <Sel value={intel.incumbentAdvantage} onChange={v=>saveIntel({incumbentAdvantage:v})} options={[
                  {value:"unknown",label:"Unknown"},
                  {value:"strong",label:"Strong — entrenched, agency loves them"},
                  {value:"moderate",label:"Moderate — performing okay"},
                  {value:"weak",label:"Weak — agency dissatisfied"},
                  {value:"none",label:"No Incumbent"},
                ]} style={{width:"100%"}} />
              </div>
              <div>
                <Label text="HGI IS INCUMBENT?" />
                <Sel value={intel.hgiIncumbent?"yes":"no"} onChange={v=>saveIntel({hgiIncumbent:v==="yes"})} options={[{value:"no",label:"No"},{value:"yes",label:"Yes — HGI is incumbent"}]} style={{width:"100%"}} />
              </div>
            </div>

            <div style={{marginBottom:12}}>
              <Label text="KNOWN COMPETITORS" />
              <Input value={intel.competitors} onChange={v=>saveIntel({competitors:v})} placeholder="ICF, Hagerty, Witt O'Brien's, Dewberry..." />
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
              <div>
                <Label text="HGI TARGET PROFIT MARGIN (%)" />
                <input type="range" min={5} max={75} value={intel.hgiMarginTarget} onChange={e=>saveIntel({hgiMarginTarget:parseInt(e.target.value)})} style={{width:"100%",accentColor:GOLD,marginBottom:4}} />
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:TEXT_D}}>
                  <span>5%</span><span style={{color:GOLD,fontWeight:700}}>{intel.hgiMarginTarget}% target</span><span>75%</span>
                </div>
              </div>
              <div>
                <Label text="PROTEST RISK TOLERANCE" />
                <Sel value={intel.protestRisk} onChange={v=>saveIntel({protestRisk:v})} options={[
                  {value:"low",label:"Low — stay well above floor"},
                  {value:"moderate",label:"Moderate — competitive but defensible"},
                  {value:"aggressive",label:"Aggressive — willing to push limits"},
                ]} style={{width:"100%"}} />
              </div>
            </div>

            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <Btn onClick={runMarketRates} disabled={marketLoading}>
                {marketLoading ? "⟳ Analyzing Market Rates..." : "1. Analyze Market Rates"}
              </Btn>
              <Btn onClick={runPTW} disabled={ptwLoading}>
                {ptwLoading ? "⟳ Running PTW Analysis..." : "2. Run Full PTW Analysis"}
              </Btn>
            </div>
          </Card>

          {(marketLoading || marketRates) && (
            <div style={{marginBottom:16}}>
              <AIOut content={marketRates} loading={marketLoading} label="MARKET RATE ANALYSIS" />
            </div>
          )}

          {(ptwLoading || ptwAnalysis) && (
            <AIOut content={ptwAnalysis} loading={ptwLoading} label="PRICE-TO-WIN ANALYSIS" />
          )}

          {recommendedPrice && !ptwLoading && (
            <Card style={{marginTop:16,border:`1px solid ${BLUE}44`,background:BLUE+"11"}}>
              <div style={{color:BLUE,fontWeight:700,fontSize:13,marginBottom:8}}>⚡ SYSTEM RECOMMENDED WIN PRICE</div>
              <div style={{fontSize:32,fontWeight:800,color:BLUE,marginBottom:4}}>{fmt(recommendedPrice)}</div>
              <div style={{color:TEXT_D,fontSize:12}}>Value scenario — best balance of win probability and margin. See full PTW analysis above for aggressive and premium alternatives.</div>
            </Card>
          )}
        </div>
      )}

      {/* ── COST BUILDUP ── */}
      {activeTab === "buildup" && (
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:13}}>LABOR CATEGORIES</div>
            <Btn small onClick={addLaborRow}>+ Add Row</Btn>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{color:TEXT_D,textAlign:"left"}}>
                  {["Labor Category","Hours","Raw Rate","Fringe","OH","G&A","Fee","Loaded Rate","Total",""].map(h=>(
                    <th key={h} style={{padding:"4px 8px",borderBottom:`1px solid ${BORDER}`,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {laborRows.map(r => {
                  const c = calcRow(r);
                  return (
                    <tr key={r.id} style={{borderBottom:`1px solid ${BORDER}22`}}>
                      <td style={{padding:"4px 8px"}}>
                        <select value={r.cat} onChange={e=>updateLR(r.id,"cat",e.target.value)} style={{background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,fontFamily:"inherit",padding:"2px 4px"}}>
                          {LABOR_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"4px 8px"}}><input type="number" value={r.hours} onChange={e=>updateLR(r.id,"hours",e.target.value)} style={{width:60,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px"}}><input type="number" value={r.rawRate} onChange={e=>updateLR(r.id,"rawRate",e.target.value)} style={{width:60,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px"}}><input type="number" step="0.01" value={r.fringe} onChange={e=>updateLR(r.id,"fringe",e.target.value)} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px"}}><input type="number" step="0.01" value={r.overhead} onChange={e=>updateLR(r.id,"overhead",e.target.value)} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px"}}><input type="number" step="0.01" value={r.ga} onChange={e=>updateLR(r.id,"ga",e.target.value)} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px"}}><input type="number" step="0.01" value={r.fee} onChange={e=>updateLR(r.id,"fee",e.target.value)} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"2px 4px"}} /></td>
                      <td style={{padding:"4px 8px",color:GREEN,fontWeight:700}}>{fmt(c.loaded)}/hr</td>
                      <td style={{padding:"4px 8px",color:GOLD,fontWeight:700}}>{fmt(c.total)}</td>
                      <td style={{padding:"4px 8px"}}><button onClick={()=>removeLR(r.id)} style={{background:"none",border:"none",color:RED,cursor:"pointer",fontSize:14}}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={8} style={{padding:"8px",color:TEXT_D,fontSize:11,fontWeight:700}}>LABOR SUBTOTAL</td><td style={{padding:"8px",color:GOLD,fontSize:13,fontWeight:700}}>{fmt(totalLabor())}</td><td></td></tr>
              </tfoot>
            </table>
          </div>
          <div style={{marginTop:16,borderTop:`1px solid ${BORDER}`,paddingTop:12}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:12,marginBottom:8}}>OTHER DIRECT COSTS (ODCs)</div>
            {odcs.map(o=>(
              <div key={o.id} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
                <input value={o.desc} onChange={e=>saveODC(odcs.map(x=>x.id===o.id?{...x,desc:e.target.value}:x))} placeholder="Description" style={{flex:1,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"4px 8px"}} />
                <input type="number" value={o.amount} onChange={e=>saveODC(odcs.map(x=>x.id===o.id?{...x,amount:e.target.value}:x))} style={{width:110,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:11,padding:"4px 8px"}} />
                <span style={{color:GREEN,fontSize:11,minWidth:80}}>{fmt(parseFloat(o.amount||0))}</span>
                <button onClick={()=>saveODC(odcs.filter(x=>x.id!==o.id))} style={{background:"none",border:"none",color:RED,cursor:"pointer"}}>×</button>
              </div>
            ))}
            <Btn small variant="ghost" onClick={()=>saveODC([...odcs,{id:Date.now(),desc:"",amount:0}])}>+ Add ODC</Btn>
            <div style={{marginTop:8,display:"flex",justifyContent:"flex-end",gap:20,fontSize:12}}>
              <span style={{color:TEXT_D}}>ODC Total: <strong style={{color:GREEN}}>{fmt(totalODC())}</strong></span>
              <span style={{color:TEXT_D}}>Base Total: <strong style={{color:GOLD}}>{fmt(totalLabor()+totalODC())}</strong></span>
            </div>
          </div>
        </Card>
      )}

      {/* ── PERIOD PRICING ── */}
      {activeTab === "periods" && (
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>PERIOD OF PERFORMANCE PRICING</div>
          {periods.map((p,i)=>(
            <div key={p.id} style={{display:"flex",gap:10,marginBottom:8,alignItems:"center",padding:"10px 12px",background:BG3,borderRadius:4}}>
              <input value={p.label} onChange={e=>savePeriods(periods.map(x=>x.id===p.id?{...x,label:e.target.value}:x))} style={{flex:1,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px"}} />
              <span style={{fontSize:11,color:TEXT_D}}>Months:</span>
              <input type="number" value={p.months} onChange={e=>savePeriods(periods.map(x=>x.id===p.id?{...x,months:e.target.value}:x))} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px"}} />
              <span style={{fontSize:11,color:TEXT_D}}>Escalation %:</span>
              <input type="number" value={p.escalation} onChange={e=>savePeriods(periods.map(x=>x.id===p.id?{...x,escalation:e.target.value}:x))} style={{width:50,background:BG4,color:TEXT,border:`1px solid ${BORDER}`,borderRadius:3,fontSize:12,padding:"4px 8px"}} />
              <span style={{color:GOLD,fontWeight:700,minWidth:100,textAlign:"right"}}>{fmt(periodTotal(p,i))}</span>
              <button onClick={()=>savePeriods(periods.filter(x=>x.id!==p.id))} style={{background:"none",border:"none",color:RED,cursor:"pointer"}}>×</button>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
            <Btn small variant="ghost" onClick={()=>savePeriods([...periods,{id:Date.now(),label:"Option Year "+periods.length,months:12,escalation:3}])}>+ Add Period</Btn>
            <span style={{marginLeft:"auto",color:GREEN,fontWeight:700,fontSize:14}}>Total Contract Value: {fmt(contractTotal())}</span>
          </div>
        </Card>
      )}

      {/* ── EVALUATION SCORE MODEL ── */}
      {activeTab === "evaluation" && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>EVALUATION CRITERIA WEIGHTS</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              {[["priceWeight","PRICE / COST"],["techWeight","TECHNICAL APPROACH"],["pastPerfWeight","PAST PERFORMANCE"],["managementWeight","MANAGEMENT"]].map(([key,label])=>(
                <div key={key}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <Label text={label} />
                    <span style={{color:GOLD,fontSize:12,fontWeight:700}}>{evalModel[key]}%</span>
                  </div>
                  <input type="range" min={0} max={60} value={evalModel[key]}
                    onChange={e=>{const n={...evalModel,[key]:parseInt(e.target.value)};setEvalModel(n);store.set("evalModel",n);}}
                    style={{width:"100%",accentColor:GOLD}} />
                </div>
              ))}
            </div>
            <div style={{padding:"8px 12px",background:BG3,borderRadius:4,marginBottom:12,fontSize:12}}>
              <span style={{color:TEXT_D}}>Total Weight: </span>
              <span style={{color:(evalModel.priceWeight+evalModel.techWeight+evalModel.pastPerfWeight+evalModel.managementWeight)===100?GREEN:RED,fontWeight:700}}>
                {evalModel.priceWeight+evalModel.techWeight+evalModel.pastPerfWeight+evalModel.managementWeight}%
              </span>
              {(evalModel.priceWeight+evalModel.techWeight+evalModel.pastPerfWeight+evalModel.managementWeight)!==100 &&
                <span style={{color:RED,marginLeft:8}}>⚠ Should equal 100%</span>}
            </div>
            <Btn onClick={runEvalModel} disabled={evalLoading}>
              {evalLoading ? "⟳ Modeling Evaluation Scores..." : "Model HGI Evaluation Scores"}
            </Btn>
          </Card>
          {(evalLoading || evalResult) && <AIOut content={evalResult} loading={evalLoading} label="EVALUATION SCORE MODEL" />}
        </div>
      )}

      {/* ── SCENARIO MODELING ── */}
      {activeTab === "scenario" && (
        <Card>
          <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:12}}>SCENARIO MODELING</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:20}}>
            {[["Fee Adjustment (%)", "feeAdj", -5, 5],["Labor Rate Adjustment (%)", "laborAdj", -20, 20],["Hours Adjustment (%)", "hoursAdj", -30, 30]].map(([label, key, min, max])=>(
              <div key={key}>
                <Label text={label.toUpperCase()} />
                <input type="range" min={min} max={max} value={scenario[key]} onChange={e=>setScenario(s=>({...s,[key]:parseInt(e.target.value)}))} style={{width:"100%",marginBottom:4,accentColor:GOLD}} />
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:TEXT_D}}>
                  <span>{min}%</span><span style={{color:GOLD,fontWeight:700}}>{scenario[key]>0?"+":""}{scenario[key]}%</span><span>+{max}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
            {[["Base",fmt(totalLabor()+totalODC()),TEXT,BORDER],["Adjusted",fmt(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)+totalODC()),GOLD,GOLD+"44"],["Delta",(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)-totalLabor())>=0?"+"+fmt(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)-totalLabor()):fmt(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)-totalLabor()),(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)-totalLabor())>=0?ORANGE:GREEN,GREEN+"44"]].map(([l,v,c,b])=>(
              <div key={l} style={{flex:1,padding:16,background:BG3,borderRadius:4,border:`1px solid ${b}`}}>
                <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>{l}</div>
                <div style={{color:c,fontSize:22,fontWeight:800}}>{v}</div>
              </div>
            ))}
            {recommendedPrice && <div style={{flex:1,padding:16,background:BG3,borderRadius:4,border:`1px solid ${BLUE}44`}}>
              <div style={{color:TEXT_D,fontSize:11,marginBottom:4}}>Gap to Win Price</div>
              <div style={{color:BLUE,fontSize:22,fontWeight:800}}>{fmt(recommendedPrice-(totalLabor(scenario.feeAdj,scenario.laborAdj,scenario.hoursAdj)+totalODC()))}</div>
            </div>}
          </div>
          <Btn small variant="ghost" onClick={()=>setScenario({feeAdj:0,laborAdj:0,hoursAdj:0})}>Reset to Base</Btn>
        </Card>
      )}

      {/* ── COST NARRATIVE ── */}
      {activeTab === "narrative" && (
        <div>
          <Card style={{marginBottom:16}}>
            <div style={{color:GOLD,fontWeight:700,fontSize:13,marginBottom:4}}>COST PROPOSAL NARRATIVE</div>
            <div style={{color:TEXT_D,fontSize:12,marginBottom:12}}>Generates a complete, submission-ready cost narrative using your buildup, PTW analysis, and contract context</div>
            <Btn onClick={generateNarrative} disabled={narrativeLoading}>{narrativeLoading?"⟳ Writing Cost Narrative...":"Generate Cost Narrative"}</Btn>
          </Card>
          {(narrativeLoading||costNarrative) && <AIOut content={costNarrative} loading={narrativeLoading} label="COST PROPOSAL NARRATIVE" />}
        </div>
      )}
    </div>
  );
}
