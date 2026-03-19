// components/ScraperInsights.js — Scraper Intelligence Dashboard

function ScraperInsights() {
  const [loading, setLoading] = React.useState(true);
  const [runs, setRuns] = React.useState([]);
  const [activeOpps, setActiveOpps] = React.useState([]);
  const [filteredOpps, setFilteredOpps] = React.useState([]);
  const [pendingOpps, setPendingOpps] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('funnel');

  React.useEffect(function() { loadData(); }, []);

  function loadData() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/hunt-analytics').then(function(r) { return r.ok ? r.json() : []; }),
      fetch('/api/opportunities?limit=200&status=active').then(function(r) { return r.ok ? r.json() : { opportunities: [] }; }),
      fetch('/api/opportunities?limit=200&status=filtered').then(function(r) { return r.ok ? r.json() : { opportunities: [] }; }),
      fetch('/api/opportunities?limit=50&status=pending_rfp').then(function(r) { return r.ok ? r.json() : { opportunities: [] }; }),
    ]).then(function(results) {
      setRuns(Array.isArray(results[0]) ? results[0] : []);
      setActiveOpps((results[1].opportunities) || []);
      setFilteredOpps((results[2].opportunities) || []);
      setPendingOpps((results[3].opportunities) || []);
      setLoading(false);
    }).catch(function(e) {
      setError(e.message);
      setLoading(false);
    });
  }

  // Parse run stats
  var parsedRuns = runs.map(function(r) {
    var stats = {};
    try { stats = JSON.parse(r.notes || '{}'); } catch(e) {}
    return Object.assign({}, r, { stats: stats });
  });

  // Aggregate scraper totals
  var totals = parsedRuns.reduce(function(acc, r) {
    var s = r.stats;
    acc.bids_reviewed += (s.bids_reviewed || 0);
    acc.relevant_found += (s.relevant_found || 0);
    acc.sent_to_intake += (s.sent_to_intake || 0);
    acc.filtered_out += (s.filtered_out || 0);
    acc.expired_skipped += (s.expired_skipped || 0);
    acc.duplicates_skipped += (s.duplicates_skipped || 0);
    return acc;
  }, { bids_reviewed: 0, relevant_found: 0, sent_to_intake: 0, filtered_out: 0, expired_skipped: 0, duplicates_skipped: 0 });

  // OPI distribution
  var buckets = { '90-100': 0, '80-89': 0, '75-79': 0, '60-74': 0, '40-59': 0, 'under40': 0 };
  activeOpps.forEach(function(o) {
    var s = o.opi_score || 0;
    if (s >= 90) buckets['90-100']++;
    else if (s >= 80) buckets['80-89']++;
    else if (s >= 75) buckets['75-79']++;
    else if (s >= 60) buckets['60-74']++;
    else if (s >= 40) buckets['40-59']++;
    else buckets['under40']++;
  });
  var maxBucket = Math.max.apply(null, Object.values(buckets).concat([1]));

  // Source breakdown
  var sourceMap = {};
  activeOpps.concat(filteredOpps).forEach(function(o) {
    var src = o.source || 'Unknown';
    if (!sourceMap[src]) sourceMap[src] = { total: 0, active: 0, filtered: 0, opiSum: 0, opiCount: 0 };
    sourceMap[src].total++;
    if (o.status === 'active') sourceMap[src].active++;
    if (o.status === 'filtered') sourceMap[src].filtered++;
    if (o.opi_score) { sourceMap[src].opiSum += o.opi_score; sourceMap[src].opiCount++; }
  });
  var sources = Object.keys(sourceMap).map(function(k) {
    var s = sourceMap[k];
    return {
      name: k,
      total: s.total,
      active: s.active,
      filtered: s.filtered,
      avgOpi: s.opiCount > 0 ? Math.round(s.opiSum / s.opiCount) : 0,
      hitRate: s.total > 0 ? Math.round((s.active / s.total) * 100) : 0,
    };
  }).sort(function(a, b) { return b.total - a.total; });

  // Vertical breakdown
  var vertMap = {};
  activeOpps.forEach(function(o) {
    var v = o.vertical || 'unknown';
    if (!vertMap[v]) vertMap[v] = { count: 0, opiSum: 0 };
    vertMap[v].count++;
    if (o.opi_score) vertMap[v].opiSum += o.opi_score;
  });
  var verticals = Object.keys(vertMap).map(function(k) {
    var v = vertMap[k];
    return { name: k, count: v.count, avgOpi: v.count > 0 ? Math.round(v.opiSum / v.count) : 0 };
  }).sort(function(a, b) { return b.count - a.count; });

  // Rates
  var relevanceRate = totals.bids_reviewed > 0 ? Math.round((totals.relevant_found / totals.bids_reviewed) * 100) : 0;
  var falsePositiveRate = totals.bids_reviewed > 0 ? Math.round((totals.filtered_out / totals.bids_reviewed) * 100) : 0;
  var tier1Count = activeOpps.filter(function(o) { return o.opi_score >= 75; }).length;

  // Styles
  var card = { background: BG2, border: '1px solid ' + BORDER, borderRadius: 8, padding: 20, marginBottom: 16 };
  var statBox = { background: BG, border: '1px solid ' + BORDER, borderRadius: 6, padding: '14px 18px', flex: 1, minWidth: 120 };

  function tabBtn(id) {
    return {
      padding: '8px 16px', border: 'none', borderRadius: 4, cursor: 'pointer',
      background: activeTab === id ? GOLD + '22' : 'transparent',
      color: activeTab === id ? GOLD : TEXT_D,
      borderBottom: activeTab === id ? '2px solid ' + GOLD : '2px solid transparent',
      fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === id ? 700 : 400,
    };
  }

  function bar(pct, color) {
    return React.createElement('div', { style: { background: BORDER, borderRadius: 4, height: 12, overflow: 'hidden', marginTop: 4 } },
      React.createElement('div', { style: { width: pct + '%', height: '100%', background: color, borderRadius: 4 } })
    );
  }

  if (loading) return React.createElement('div', { style: { padding: 40, textAlign: 'center', color: TEXT_D } },
    React.createElement('div', { style: { fontSize: 24, marginBottom: 12 } }, String.fromCharCode(8853)),
    React.createElement('div', null, 'Loading scraper intelligence...')
  );

  if (error) return React.createElement('div', { style: { padding: 20, color: '#ff6b6b' } }, 'Error: ' + error,
    React.createElement('button', { onClick: loadData, style: { marginLeft: 12, background: GOLD, color: BG, border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' } }, 'Retry')
  );

  return React.createElement('div', { style: { maxWidth: 1100 } },

    // Header
    React.createElement('div', { style: { marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement('div', null,
        React.createElement('h2', { style: { color: GOLD, margin: 0, fontSize: 20, fontWeight: 800 } }, 'Scraper Intelligence Dashboard'),
        React.createElement('div', { style: { color: TEXT_D, fontSize: 12, marginTop: 4 } },
          runs.length + ' runs logged · ' + (activeOpps.length + filteredOpps.length + pendingOpps.length) + ' total records · ' + activeOpps.length + ' active'
        )
      ),
      React.createElement('button', { onClick: loadData, style: { background: 'transparent', border: '1px solid ' + BORDER, color: TEXT_D, borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 12 } }, 'Refresh')
    ),

    // KPI Row
    React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' } },
      [
        { label: 'Bids Reviewed', value: totals.bids_reviewed.toLocaleString(), sub: 'all time', color: GOLD },
        { label: 'Relevance Rate', value: relevanceRate + '%', sub: 'pass keyword filter', color: relevanceRate > 15 ? GREEN : ORANGE },
        { label: 'Active Pipeline', value: activeOpps.length, sub: 'scored opportunities', color: GOLD },
        { label: 'Tier 1 (OPI 75+)', value: tier1Count, sub: 'qualified opportunities', color: tier1Count > 0 ? GREEN : TEXT_D },
        { label: 'Pending RFP', value: pendingOpps.length, sub: 'embargoed listings', color: TEXT_D },
        { label: 'False Positive Rate', value: falsePositiveRate + '%', sub: 'filtered before intake', color: falsePositiveRate > 80 ? '#ff6b6b' : falsePositiveRate > 60 ? ORANGE : GREEN },
      ].map(function(s) {
        return React.createElement('div', { key: s.label, style: statBox },
          React.createElement('div', { style: { color: s.color, fontSize: 26, fontWeight: 800, lineHeight: 1 } }, s.value),
          React.createElement('div', { style: { color: TEXT_D, fontSize: 11, marginTop: 4, fontWeight: 700 } }, s.label),
          React.createElement('div', { style: { color: TEXT_D, fontSize: 10, opacity: 0.7 } }, s.sub)
        );
      })
    ),

    // Tabs
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid ' + BORDER } },
      [
        { id: 'funnel', label: 'Funnel' },
        { id: 'opi', label: 'OPI Distribution' },
        { id: 'sources', label: 'Sources' },
        { id: 'verticals', label: 'Verticals' },
        { id: 'runs', label: 'Run History' },
      ].map(function(t) {
        return React.createElement('button', { key: t.id, onClick: function() { setActiveTab(t.id); }, style: tabBtn(t.id) }, t.label);
      })
    ),

    // FUNNEL TAB
    activeTab === 'funnel' && React.createElement('div', null,
      React.createElement('div', { style: card },
        React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 } }, 'Scraper Funnel — All Time'),
        [
          { label: '1. Bids Reviewed by Scrapers', value: totals.bids_reviewed, pct: 100, color: TEXT_D },
          { label: '2. Passed Keyword Filter', value: totals.relevant_found, pct: totals.bids_reviewed > 0 ? Math.round(totals.relevant_found / totals.bids_reviewed * 100) : 0, color: GOLD },
          { label: '3. Sent to Intake', value: totals.sent_to_intake, pct: totals.bids_reviewed > 0 ? Math.round(totals.sent_to_intake / totals.bids_reviewed * 100) : 0, color: GOLD },
          { label: '4. Active in Pipeline (OPI 40+)', value: activeOpps.length, pct: totals.bids_reviewed > 0 ? Math.round(activeOpps.length / totals.bids_reviewed * 100) : 0, color: GREEN },
          { label: '5. Tier 1 (OPI 75+)', value: tier1Count, pct: totals.bids_reviewed > 0 ? Math.round(tier1Count / totals.bids_reviewed * 100) : 0, color: GREEN },
        ].map(function(step) {
          return React.createElement('div', { key: step.label, style: { marginBottom: 14 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement('span', { style: { color: TEXT_D, fontSize: 12 } }, step.label),
              React.createElement('span', { style: { color: step.color, fontSize: 12, fontWeight: 700 } }, step.value.toLocaleString() + ' (' + step.pct + '%)')
            ),
            bar(step.pct, step.color)
          );
        }),
        React.createElement('div', { style: { marginTop: 20, padding: 12, background: BG, borderRadius: 6, border: '1px solid ' + BORDER } },
          React.createElement('div', { style: { color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 6 } }, 'Filter Breakdown'),
          [
            { label: 'Not keyword relevant', value: totals.filtered_out, color: '#ff6b6b' },
            { label: 'Expired / past deadline', value: totals.expired_skipped, color: ORANGE },
            { label: 'Duplicates skipped', value: totals.duplicates_skipped, color: TEXT_D },
            { label: 'Low OPI (below 40)', value: filteredOpps.length, color: TEXT_D },
          ].map(function(f) {
            return React.createElement('div', { key: f.label, style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid ' + BORDER } },
              React.createElement('span', { style: { color: TEXT_D, fontSize: 12 } }, f.label),
              React.createElement('span', { style: { color: f.color, fontWeight: 700, fontSize: 12 } }, f.value.toLocaleString())
            );
          })
        )
      )
    ),

    // OPI DISTRIBUTION TAB
    activeTab === 'opi' && React.createElement('div', { style: card },
      React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 4 } }, 'OPI Score Distribution'),
      React.createElement('div', { style: { color: TEXT_D, fontSize: 11, marginBottom: 20 } }, 'Active pipeline records only (' + activeOpps.length + ' total)'),
      [
        { key: '90-100', label: '90-100 — Build proposal immediately', color: GREEN },
        { key: '80-89', label: '80-89 — Strong fit, pursue', color: GREEN },
        { key: '75-79', label: '75-79 — Qualified, investigate', color: GOLD },
        { key: '60-74', label: '60-74 — Marginal, monitor only', color: ORANGE },
        { key: '40-59', label: '40-59 — Weak fit', color: '#ff6b6b' },
        { key: 'under40', label: 'Under 40 — Should be filtered', color: BORDER },
      ].map(function(b) {
        var count = buckets[b.key];
        var pct = activeOpps.length > 0 ? Math.round((count / activeOpps.length) * 100) : 0;
        var barW = Math.round((count / maxBucket) * 100);
        return React.createElement('div', { key: b.key, style: { marginBottom: 14 } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
            React.createElement('span', { style: { color: TEXT_D, fontSize: 12 } }, b.label),
            React.createElement('span', { style: { color: b.color, fontWeight: 700, fontSize: 13 } }, count + ' (' + pct + '%)')
          ),
          bar(barW, b.color)
        );
      }),
      React.createElement('div', { style: { marginTop: 20, padding: 12, background: BG, borderRadius: 6, border: '1px solid ' + BORDER } },
        React.createElement('div', { style: { color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 6 } }, 'Calibration Note'),
        React.createElement('div', { style: { color: TEXT_D, fontSize: 11, lineHeight: 1.6 } },
          'OPI scores are AI-estimated from opportunity text + KB chunks. No win/loss data yet. After the Data Call (March 24), scores will be recalibrated against actual HGI contract history. Current threshold: OPI 75+ triggers Tier 1 review.'
        )
      )
    ),

    // SOURCES TAB
    activeTab === 'sources' && React.createElement('div', null,
      React.createElement('div', { style: card },
        React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 } }, 'Source Performance'),
        sources.length === 0
          ? React.createElement('div', { style: { color: TEXT_D, fontSize: 12 } }, 'No source data yet.')
          : sources.map(function(s) {
            return React.createElement('div', { key: s.name, style: { padding: '14px 0', borderBottom: '1px solid ' + BORDER } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
                React.createElement('span', { style: { color: GOLD, fontSize: 13, fontWeight: 700 } }, s.name),
                React.createElement('span', { style: { color: TEXT_D, fontSize: 11 } }, s.total + ' total records')
              ),
              React.createElement('div', { style: { display: 'flex', gap: 24 } },
                [
                  { label: 'Active', value: s.active, color: GREEN },
                  { label: 'Filtered', value: s.filtered, color: '#ff6b6b' },
                  { label: 'Avg OPI', value: s.avgOpi, color: s.avgOpi >= 75 ? GREEN : s.avgOpi >= 60 ? GOLD : ORANGE },
                  { label: 'Hit Rate', value: s.hitRate + '%', color: s.hitRate > 20 ? GREEN : s.hitRate > 10 ? GOLD : ORANGE },
                ].map(function(m) {
                  return React.createElement('div', { key: m.label },
                    React.createElement('div', { style: { color: m.color, fontWeight: 700, fontSize: 20 } }, m.value),
                    React.createElement('div', { style: { color: TEXT_D, fontSize: 10 } }, m.label)
                  );
                })
              )
            );
          })
      ),
      React.createElement('div', { style: Object.assign({}, card, { background: BG }) },
        React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8 } }, 'Coverage Gaps'),
        React.createElement('div', { style: { color: TEXT_D, fontSize: 12, lineHeight: 1.8 } },
          React.createElement('div', null, '• Texas SmartBuy (ESBD) — not yet active. Texas is HGI primary market.'),
          React.createElement('div', null, '• SAM.gov — federal pass-through opportunities. Not yet integrated.'),
          React.createElement('div', null, '• Louisiana Housing Corporation — HUD/CDBG-DR source. Not yet monitored.'),
          React.createElement('div', null, '• Florida / Mississippi portals — disaster recovery expansion markets.')
        )
      )
    ),

    // VERTICALS TAB
    activeTab === 'verticals' && React.createElement('div', { style: card },
      React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 4 } }, 'Vertical Breakdown'),
      React.createElement('div', { style: { color: TEXT_D, fontSize: 11, marginBottom: 20 } }, 'What the scrapers are actually finding — active pipeline only'),
      verticals.length === 0
        ? React.createElement('div', { style: { color: TEXT_D, fontSize: 12 } }, 'No vertical data yet.')
        : verticals.map(function(v) {
          var labels = { disaster: 'Disaster Recovery', tpa: 'TPA / Claims', workforce: 'Workforce / WIOA', health: 'Health & Human Services', infrastructure: 'Construction Management', tax_appeals: 'Property Tax Appeals', federal: 'Federal Programs', unknown: 'Unclassified' };
          var pct = activeOpps.length > 0 ? Math.round((v.count / activeOpps.length) * 100) : 0;
          return React.createElement('div', { key: v.name, style: { marginBottom: 14 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement('span', { style: { color: TEXT_D, fontSize: 13 } }, labels[v.name] || v.name),
              React.createElement('span', { style: { color: GOLD, fontWeight: 700, fontSize: 12 } }, v.count + ' opps · avg OPI ' + v.avgOpi)
            ),
            bar(pct, GOLD)
          );
        }),
      React.createElement('div', { style: { marginTop: 16, padding: 12, background: BG, borderRadius: 6, border: '1px solid ' + BORDER } },
        React.createElement('div', { style: { color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 6 } }, 'Signal'),
        React.createElement('div', { style: { color: TEXT_D, fontSize: 11, lineHeight: 1.6 } },
          'If Disaster Recovery is underrepresented, keywords need tuning. TPA/Claims opps are rare on public portals — most come through direct relationships. High unclassified count means thin RFP text at intake.'
        )
      )
    ),

    // RUN HISTORY TAB
    activeTab === 'runs' && React.createElement('div', { style: card },
      React.createElement('div', { style: { color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 } }, 'Recent Run History'),
      runs.length === 0
        ? React.createElement('div', { style: { color: TEXT_D, fontSize: 12 } }, 'No run history yet.')
        : React.createElement('div', { style: { overflowX: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { borderBottom: '1px solid ' + BORDER } },
                ['Time', 'Source', 'Reviewed', 'Relevant', 'Sent', 'Filtered', 'Expired', 'Dupes'].map(function(h) {
                  return React.createElement('th', { key: h, style: { color: TEXT_D, fontWeight: 700, padding: '6px 10px', textAlign: 'left', opacity: 0.7 } }, h);
                })
              )
            ),
            React.createElement('tbody', null,
              parsedRuns.slice(0, 30).map(function(r, i) {
                var s = r.stats;
                var t = new Date(r.run_at);
                var timeStr = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                return React.createElement('tr', { key: i, style: { borderBottom: '1px solid ' + BORDER } },
                  React.createElement('td', { style: { padding: '6px 10px', color: TEXT_D } }, timeStr),
                  React.createElement('td', { style: { padding: '6px 10px', color: GOLD } }, r.source || '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: TEXT_D } }, s.bids_reviewed || r.opportunities_found || '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: s.relevant_found > 0 ? GREEN : TEXT_D } }, s.relevant_found != null ? s.relevant_found : '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: s.sent_to_intake > 0 ? GREEN : TEXT_D } }, s.sent_to_intake != null ? s.sent_to_intake : '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: s.filtered_out > 0 ? '#ff6b6b' : TEXT_D } }, s.filtered_out != null ? s.filtered_out : '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: TEXT_D } }, s.expired_skipped != null ? s.expired_skipped : '—'),
                  React.createElement('td', { style: { padding: '6px 10px', color: TEXT_D } }, s.duplicates_skipped != null ? s.duplicates_skipped : '—')
                );
              })
            )
          )
        )
    )
  );
}
