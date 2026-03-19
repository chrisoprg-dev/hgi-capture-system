Create a new file with the following content exactly:

// components/ScraperInsights.js — Scraper Intelligence Dashboard

function ScraperInsights() {
  const [loading, setLoading] = React.useState(true);
  const [runs, setRuns] = React.useState([]);
  const [pipeline, setPipeline] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('funnel');

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load hunt runs
      const runsRes = await fetch('/api/hunt-analytics');
      const runsData = runsRes.ok ? await runsRes.json() : [];

      // Load all pipeline records (active + filtered) for analysis
      const [activeRes, filteredRes, pendingRes] = await Promise.all([
        fetch('/api/opportunities?limit=200&status=active'),
        fetch('/api/opportunities?limit=200&status=filtered'),
        fetch('/api/opportunities?limit=50&status=pending_rfp'),
      ]);

      const activeData = activeRes.ok ? await activeRes.json() : { opportunities: [] };
      const filteredData = filteredRes.ok ? await filteredRes.json() : { opportunities: [] };
      const pendingData = pendingRes.ok ? await pendingRes.json() : { opportunities: [] };

      const allOpps = [
        ...(activeData.opportunities || []),
        ...(filteredData.opportunities || []),
        ...(pendingData.opportunities || []),
      ];

      setRuns(Array.isArray(runsData) ? runsData : []);
      setPipeline(allOpps);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Computed stats ──────────────────────────────────────────────────────

  const activeOpps = pipeline.filter(o => o.status === 'active');
  const filteredOpps = pipeline.filter(o => o.status === 'filtered');
  const pendingOpps = pipeline.filter(o => o.status === 'pending_rfp');

  // Parse run stats from notes field
  const parsedRuns = runs.map(r => {
    let stats = {};
    try { stats = JSON.parse(r.notes || '{}'); } catch(e) {}
    return { ...r, stats };
  });

  // Aggregate scraper stats from all runs
  const scraperTotals = parsedRuns.reduce((acc, r) => {
    const s = r.stats;
    acc.bids_reviewed += s.bids_reviewed || 0;
    acc.relevant_found += s.relevant_found || 0;
    acc.sent_to_intake += s.sent_to_intake || 0;
    acc.filtered_out += s.filtered_out || 0;
    acc.expired_skipped += s.expired_skipped || 0;
    acc.duplicates_skipped += s.duplicates_skipped || 0;
    acc.categories_processed += s.categories_processed || 0;
    return acc;
  }, { bids_reviewed: 0, relevant_found: 0, sent_to_intake: 0, filtered_out: 0, expired_skipped: 0, duplicates_skipped: 0, categories_processed: 0 });

  // Source breakdown from pipeline
  const sourceBreakdown = {};
  pipeline.forEach(o => {
    const src = o.source || 'Unknown';
    if (!sourceBreakdown[src]) sourceBreakdown[src] = { total: 0, active: 0, filtered: 0, avgOpi: 0, opiSum: 0, opiCount: 0 };
    sourceBreakdown[src].total++;
    if (o.status === 'active') sourceBreakdown[src].active++;
    if (o.status === 'filtered') sourceBreakdown[src].filtered++;
    if (o.opi_score) { sourceBreakdown[src].opiSum += o.opi_score; sourceBreakdown[src].opiCount++; }
  });
  Object.keys(sourceBreakdown).forEach(k => {
    const s = sourceBreakdown[k];
    s.avgOpi = s.opiCount > 0 ? Math.round(s.opiSum / s.opiCount) : 0;
    s.hitRate = s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;
  });

  // Vertical breakdown
  const verticalBreakdown = {};
  activeOpps.forEach(o => {
    const v = o.vertical || 'unknown';
    if (!verticalBreakdown[v]) verticalBreakdown[v] = { count: 0, avgOpi: 0, opiSum: 0 };
    verticalBreakdown[v].count++;
    if (o.opi_score) verticalBreakdown[v].opiSum += o.opi_score;
  });
  Object.keys(verticalBreakdown).forEach(k => {
    const v = verticalBreakdown[k];
    v.avgOpi = v.count > 0 ? Math.round(v.opiSum / v.count) : 0;
  });
  const sortedVerticals = Object.entries(verticalBreakdown).sort((a, b) => b[1].count - a[1].count);

  // OPI distribution buckets
  const opiBuckets = { '90-100': 0, '80-89': 0, '75-79': 0, '60-74': 0, '40-59': 0, '<40': 0 };
  activeOpps.forEach(o => {
    const s = o.opi_score || 0;
    if (s >= 90) opiBuckets['90-100']++;
    else if (s >= 80) opiBuckets['80-89']++;
    else if (s >= 75) opiBuckets['75-79']++;
    else if (s >= 60) opiBuckets['60-74']++;
    else if (s >= 40) opiBuckets['40-59']++;
    else opiBuckets['<40']++;
  });
  const maxBucket = Math.max(...Object.values(opiBuckets), 1);

  // Funnel rates
  const relevanceRate = scraperTotals.bids_reviewed > 0 
    ? Math.round((scraperTotals.relevant_found / scraperTotals.bids_reviewed) * 100) : 0;
  const intakeRate = scraperTotals.relevant_found > 0 
    ? Math.round((scraperTotals.sent_to_intake / scraperTotals.relevant_found) * 100) : 0;
  const survivalRate = scraperTotals.sent_to_intake > 0 
    ? Math.round((activeOpps.length / Math.max(scraperTotals.sent_to_intake, activeOpps.length)) * 100) : 0;
  const falsePositiveRate = scraperTotals.bids_reviewed > 0
    ? Math.round((scraperTotals.filtered_out / scraperTotals.bids_reviewed) * 100) : 0;

  // Recent run quality trend (last 10 runs with stats)
  const recentRunsWithStats = parsedRuns
    .filter(r => r.stats.bids_reviewed > 0)
    .slice(0, 10);

  // ── Styles ──────────────────────────────────────────────────────────────

  const card = { background: BG2, border: '1px solid ' + BORDER, borderRadius: 8, padding: 20, marginBottom: 16 };
  const statBox = { background: BG, border: '1px solid ' + BORDER, borderRadius: 6, padding: '14px 18px', flex: 1, minWidth: 120 };
  const tabBtn = (id) => ({
    padding: '8px 16px', border: 'none', borderRadius: 4, cursor: 'pointer',
    background: activeTab === id ? GOLD + '22' : 'transparent',
    color: activeTab === id ? GOLD : TEXT_D,
    borderBottom: activeTab === id ? '2px solid ' + GOLD : '2px solid transparent',
    fontFamily: 'inherit', fontSize: 12, fontWeight: activeTab === id ? 700 : 400,
  });

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: TEXT_D }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>⊕</div>
      <div>Loading scraper intelligence...</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 20, color: '#ff6b6b', background: BG2, borderRadius: 8, border: '1px solid #ff6b6b33' }}>
      Error loading data: {error}
      <button onClick={loadData} style={{ marginLeft: 12, background: GOLD, color: BG, border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>Retry</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ color: GOLD, margin: 0, fontSize: 20, fontWeight: 800 }}>Scraper Intelligence Dashboard</h2>
            <div style={{ color: TEXT_D, fontSize: 12, marginTop: 4 }}>
              {runs.length} runs logged · {pipeline.length} total records · {activeOpps.length} active
            </div>
          </div>
          <button onClick={loadData} style={{ background: 'transparent', border: '1px solid ' + BORDER, color: TEXT_D, borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Top KPI Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Bids Reviewed', value: scraperTotals.bids_reviewed.toLocaleString(), sub: 'all time' },
          { label: 'Relevance Rate', value: relevanceRate + '%', sub: 'pass keyword filter', color: relevanceRate > 20 ? GREEN : relevanceRate > 10 ? ORANGE : '#ff6b6b' },
          { label: 'Active Pipeline', value: activeOpps.length, sub: 'scored opportunities' },
          { label: 'Pending RFP', value: pendingOpps.length, sub: 'embargoed listings' },
          { label: 'False Positive Rate', value: falsePositiveRate + '%', sub: 'filtered before intake', color: falsePositiveRate > 80 ? '#ff6b6b' : falsePositiveRate > 60 ? ORANGE : GREEN },
          { label: 'Duplicates Skipped', value: scraperTotals.duplicates_skipped.toLocaleString(), sub: 'already in pipeline' },
        ].map(s => (
          <div key={s.label} style={statBox}>
            <div style={{ color: s.color || GOLD, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
            <div style={{ color: TEXT_D, fontSize: 11, marginTop: 4, fontWeight: 700 }}>{s.label}</div>
            <div style={{ color: TEXT_D, fontSize: 10, opacity: 0.7 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid ' + BORDER }}>
        {[
          { id: 'funnel', label: '◎ Funnel' },
          { id: 'opi', label: '◆ OPI Distribution' },
          { id: 'sources', label: '⊕ Sources' },
          { id: 'verticals', label: '◉ Verticals' },
          { id: 'runs', label: '⌂ Run History' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabBtn(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── FUNNEL TAB ── */}
      {activeTab === 'funnel' && (
        <div>
          <div style={card}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Scraper Funnel — All Time</div>
            {[
              { label: 'Bids Reviewed by Scrapers', value: scraperTotals.bids_reviewed, pct: 100, color: TEXT_D },
              { label: 'Passed Keyword Filter (Relevant)', value: scraperTotals.relevant_found, pct: scraperTotals.bids_reviewed > 0 ? Math.round(scraperTotals.relevant_found / scraperTotals.bids_reviewed * 100) : 0, color: GOLD },
              { label: 'Sent to Intake', value: scraperTotals.sent_to_intake, pct: scraperTotals.bids_reviewed > 0 ? Math.round(scraperTotals.sent_to_intake / scraperTotals.bids_reviewed * 100) : 0, color: GOLD },
              { label: 'Active in Pipeline (OPI ≥ 40)', value: activeOpps.length, pct: scraperTotals.bids_reviewed > 0 ? Math.round(activeOpps.length / scraperTotals.bids_reviewed * 100) : 0, color: GREEN },
              { label: 'Tier 1 (OPI ≥ 75)', value: activeOpps.filter(o => o.opi_score >= 75).length, pct: scraperTotals.bids_reviewed > 0 ? Math.round(activeOpps.filter(o => o.opi_score >= 75).length / scraperTotals.bids_reviewed * 100) : 0, color: GREEN },
            ].map((step, i) => (
              <div key={step.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: TEXT_D, fontSize: 12 }}>{i + 1}. {step.label}</span>
                  <span style={{ color: step.color, fontSize: 12, fontWeight: 700 }}>{step.value.toLocaleString()} ({step.pct}%)</span>
                </div>
                <div style={{ background: BORDER, borderRadius: 3, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: step.pct + '%', height: '100%', background: step.color, borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ ...card, flex: 1 }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>What Gets Filtered Out</div>
              {[
                { label: 'Not Keyword Relevant', value: scraperTotals.filtered_out, color: '#ff6b6b' },
                { label: 'Expired / Past Deadline', value: scraperTotals.expired_skipped, color: ORANGE },
                { label: 'Duplicates', value: scraperTotals.duplicates_skipped, color: TEXT_D },
                { label: 'Low OPI (< 40)', value: filteredOpps.length, color: TEXT_D },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid ' + BORDER }}>
                  <span style={{ color: TEXT_D, fontSize: 12 }}>{f.label}</span>
                  <span style={{ color: f.color, fontWeight: 700, fontSize: 12 }}>{f.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ ...card, flex: 1 }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Pipeline Health Signal</div>
              {[
                { label: 'Relevance Rate', value: relevanceRate + '%', good: relevanceRate > 15, note: relevanceRate > 15 ? 'Keywords well-tuned' : 'Too many irrelevant hits' },
                { label: 'OPI Survival Rate', value: survivalRate + '%', good: survivalRate > 30, note: survivalRate > 30 ? 'Good quality intake' : 'Scoring filters too aggressive' },
                { label: 'Tier 1 Rate', value: activeOpps.length > 0 ? Math.round(activeOpps.filter(o => o.opi_score >= 75).length / activeOpps.length * 100) + '%' : '0%', good: activeOpps.filter(o => o.opi_score >= 75).length > 0, note: 'Of active opps at OPI 75+' },
              ].map(h => (
                <div key={h.label} style={{ padding: '8px 0', borderBottom: '1px solid ' + BORDER }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: TEXT_D, fontSize: 12 }}>{h.label}</span>
                    <span style={{ color: h.good ? GREEN : ORANGE, fontWeight: 700, fontSize: 12 }}>{h.value}</span>
                  </div>
                  <div style={{ color: TEXT_D, fontSize: 10, opacity: 0.7, marginTop: 2 }}>{h.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── OPI DISTRIBUTION TAB ── */}
      {activeTab === 'opi' && (
        <div style={card}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>OPI Score Distribution</div>
          <div style={{ color: TEXT_D, fontSize: 11, marginBottom: 20 }}>Active pipeline records only ({activeOpps.length} total)</div>
          {Object.entries(opiBuckets).map(([bucket, count]) => {
            const pct = Math.round((count / Math.max(activeOpps.length, 1)) * 100);
            const barWidth = maxBucket > 0 ? Math.round((count / maxBucket) * 100) : 0;
            const color = bucket === '90-100' ? GREEN : bucket === '80-89' ? GREEN : bucket === '75-79' ? GOLD : bucket === '60-74' ? ORANGE : '#ff6b6b';
            const label = bucket === '90-100' ? '🟢 90-100 — Build proposal immediately' :
              bucket === '80-89' ? '🟢 80-89 — Strong fit, Intelligence Engine triggers' :
              bucket === '75-79' ? '🟡 75-79 — Qualified, worth investigating' :
              bucket === '60-74' ? '🟠 60-74 — Marginal, monitor only' :
              bucket === '40-59' ? '🔴 40-59 — Weak fit' : '⚫ < 40 — Should be filtered';
            return (
              <div key={bucket} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: TEXT_D, fontSize: 12 }}>{label}</span>
                  <span style={{ color, fontWeight: 700, fontSize: 13 }}>{count} ({pct}%)</span>
                </div>
                <div style={{ background: BORDER, borderRadius: 4, height: 20, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: barWidth + '%', height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s', opacity: 0.85 }} />
                  {count > 0 && <span style={{ position: 'absolute', left: 8, top: 2, fontSize: 11, color: '#fff', fontWeight: 700 }}>{count}</span>}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 20, padding: 12, background: BG, borderRadius: 6, border: '1px solid ' + BORDER }}>
            <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Calibration Notes</div>
            <div style={{ color: TEXT_D, fontSize: 11, lineHeight: 1.6 }}>
              OPI scores are currently AI-estimated from opportunity text + {'{'}4{'}'} KB chunks. No win/loss data yet. 
              After the Data Call (March 24), scores will be recalibrated against actual HGI contract history.
              Current threshold: OPI 75+ = Tier 1 review. OPI 80+ = Intelligence Engine (coming).
            </div>
          </div>
        </div>
      )}

      {/* ── SOURCES TAB ── */}
      {activeTab === 'sources' && (
        <div>
          <div style={card}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Source Performance</div>
            {Object.entries(sourceBreakdown).length === 0 ? (
              <div style={{ color: TEXT_D, fontSize: 12 }}>No source data yet.</div>
            ) : Object.entries(sourceBreakdown).sort((a, b) => b[1].total - a[1].total).map(([src, s]) => (
              <div key={src} style={{ padding: '14px 0', borderBottom: '1px solid ' + BORDER }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: GOLD, fontSize: 13, fontWeight: 700 }}>{src}</span>
                  <span style={{ color: TEXT_D, fontSize: 11 }}>{s.total} total records</span>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[
                    { label: 'Active', value: s.active, color: GREEN },
                    { label: 'Filtered', value: s.filtered, color: '#ff6b6b' },
                    { label: 'Avg OPI', value: s.avgOpi, color: s.avgOpi >= 75 ? GREEN : s.avgOpi >= 60 ? GOLD : ORANGE },
                    { label: 'Hit Rate', value: s.hitRate + '%', color: s.hitRate > 20 ? GREEN : s.hitRate > 10 ? GOLD : ORANGE },
                  ].map(m => (
                    <div key={m.label}>
                      <div style={{ color: m.color, fontWeight: 700, fontSize: 18 }}>{m.value}</div>
                      <div style={{ color: TEXT_D, fontSize: 10 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, background: BG }}>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Coverage Gaps</div>
            <div style={{ color: TEXT_D, fontSize: 12, lineHeight: 1.7 }}>
              <div>• <strong style={{ color: TEXT_D }}>Texas SmartBuy (ESBD)</strong> — not yet active. Texas is HGI primary market.</div>
              <div>• <strong style={{ color: TEXT_D }}>SAM.gov</strong> — federal pass-through opps. Not yet integrated.</div>
              <div>• <strong style={{ color: TEXT_D }}>Louisiana Housing Corporation</strong> — HUD/CDBG-DR source. Not yet monitored.</div>
              <div>• <strong style={{ color: TEXT_D }}>Florida / Mississippi portals</strong> — disaster recovery expansion markets.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── VERTICALS TAB ── */}
      {activeTab === 'verticals' && (
        <div style={card}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Vertical Breakdown</div>
          <div style={{ color: TEXT_D, fontSize: 11, marginBottom: 20 }}>What the scrapers are actually finding (active pipeline)</div>
          {sortedVerticals.length === 0 ? (
            <div style={{ color: TEXT_D, fontSize: 12 }}>No vertical data yet.</div>
          ) : sortedVerticals.map(([v, data]) => {
            const pct = activeOpps.length > 0 ? Math.round((data.count / activeOpps.length) * 100) : 0;
            const verticalLabel = {
              disaster: '🌀 Disaster Recovery',
              tpa: '🏥 TPA / Claims',
              workforce: '👷 Workforce / WIOA',
              health: '⚕️ Health & Human Services',
              infrastructure: '🏗️ Construction Management',
              tax_appeals: '📋 Property Tax Appeals',
              federal: '🏛️ Federal Programs',
              unknown: '❓ Unclassified',
            }[v] || v;
            return (
              <div key={v} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: TEXT_D, fontSize: 13 }}>{verticalLabel}</span>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 12 }}>{data.count} opps · avg OPI {data.avgOpi}</span>
                </div>
                <div style={{ background: BORDER, borderRadius: 4, height: 16, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: GOLD, borderRadius: 4, opacity: 0.7 }} />
                </div>
                <div style={{ color: TEXT_D, fontSize: 10, marginTop: 3, opacity: 0.7 }}>{pct}% of active pipeline</div>
              </div>
            );
          })}
          <div style={{ marginTop: 20, padding: 12, background: BG, borderRadius: 6, border: '1px solid ' + BORDER }}>
            <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Signal</div>
            <div style={{ color: TEXT_D, fontSize: 11, lineHeight: 1.6 }}>
              If Disaster Recovery is underrepresented relative to HGI's core business, keywords need tuning.
              TPA/Claims opps are rare on public portals — most come through direct relationships and recompetes.
              High "unknown" vertical count indicates thin RFP text at intake — content gate working as designed.
            </div>
          </div>
        </div>
      )}

      {/* ── RUN HISTORY TAB ── */}
      {activeTab === 'runs' && (
        <div style={card}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Recent Run History</div>
          {runs.length === 0 ? (
            <div style={{ color: TEXT_D, fontSize: 12 }}>No run history yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid ' + BORDER }}>
                    {['Time', 'Source', 'Reviewed', 'Relevant', 'Sent', 'Filtered', 'Expired', 'Dupes'].map(h => (
                      <th key={h} style={{ color: TEXT_D, fontWeight: 700, padding: '6px 10px', textAlign: 'left', opacity: 0.7 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRuns.slice(0, 30).map((r, i) => {
                    const s = r.stats;
                    const t = new Date(r.run_at);
                    const timeStr = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid ' + BORDER, opacity: 0.9 }}>
                        <td style={{ padding: '6px 10px', color: TEXT_D }}>{timeStr}</td>
                        <td style={{ padding: '6px 10px', color: GOLD }}>{r.source || '—'}</td>
                        <td style={{ padding: '6px 10px', color: TEXT_D }}>{s.bids_reviewed || r.opportunities_found || '—'}</td>
                        <td style={{ padding: '6px 10px', color: s.relevant_found > 0 ? GREEN : TEXT_D }}>{s.relevant_found ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: s.sent_to_intake > 0 ? GREEN : TEXT_D }}>{s.sent_to_intake ?? r.opportunities_found ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: s.filtered_out > 0 ? '#ff6b6b' : TEXT_D }}>{s.filtered_out ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: TEXT_D }}>{s.expired_skipped ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: TEXT_D }}>{s.duplicates_skipped ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
