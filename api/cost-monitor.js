export const config = { maxDuration: 30 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };

// Pricing per token (as of March 2026)
const PRICE = {
  'claude-sonnet-4-20250514':  { in: 0.000003,    out: 0.000015    },
  'claude-haiku-4-5-20251001': { in: 0.00000025,  out: 0.00000125  }
};
const WEB_SEARCH_COST = 0.01;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Pull all cost log entries — stored in hunt_runs with source='api_cost'
    var r = await fetch(SB + '/rest/v1/hunt_runs?source=eq.api_cost&order=run_at.desc&limit=2000', { headers: H });
    var rows = await r.json();
    if (!rows || !rows.length) return res.status(200).json({ message: 'No cost data yet. Logs will appear after next agent run.', total_usd: 0 });

    var now = new Date();
    var cstNow = new Date(Date.now() - 6 * 3600000);
    var todayCST = cstNow.toISOString().slice(0, 10);
    var weekAgo = new Date(cstNow - 7 * 86400000).toISOString().slice(0, 10);
    var monthStart = cstNow.toISOString().slice(0, 7) + '-01';

    var totals = { today: 0, week: 0, month: 0, all_time: 0 };
    var byAgent = {};
    var byModel = {};
    var byDay = {};
    var webSearchCount = 0;
    var callCount = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var d;
      try { d = JSON.parse(row.status || '{}'); } catch(e) { continue; }
      if (!d.cost_usd) continue;

      var cost = d.cost_usd;
      var dayKey = (row.run_at || '').slice(0, 10);
      var agent = d.agent || 'unknown';
      var model = d.model || 'unknown';
      callCount++;

      // Totals by period
      totals.all_time += cost;
      if (dayKey === todayCST) totals.today += cost;
      if (dayKey >= weekAgo) totals.week += cost;
      if (dayKey >= monthStart) totals.month += cost;

      // By agent
      if (!byAgent[agent]) byAgent[agent] = { calls: 0, cost: 0, input_tokens: 0, output_tokens: 0 };
      byAgent[agent].calls++;
      byAgent[agent].cost += cost;
      byAgent[agent].input_tokens += d.input_tokens || 0;
      byAgent[agent].output_tokens += d.output_tokens || 0;

      // By model
      if (!byModel[model]) byModel[model] = { calls: 0, cost: 0 };
      byModel[model].calls++;
      byModel[model].cost += cost;

      // By day
      if (!byDay[dayKey]) byDay[dayKey] = 0;
      byDay[dayKey] += cost;

      // Web search count
      if (agent === 'web_search') webSearchCount++;
    }

    // Sort agents by cost descending
    var agentList = Object.keys(byAgent).map(function(a) {
      return { agent: a, calls: byAgent[a].calls, cost_usd: Math.round(byAgent[a].cost * 10000) / 10000, input_tokens: byAgent[a].input_tokens, output_tokens: byAgent[a].output_tokens };
    }).sort(function(a, b) { return b.cost_usd - a.cost_usd; });

    // Last 14 days sorted
    var dayList = Object.keys(byDay).sort().slice(-14).map(function(day) {
      return { date: day, cost_usd: Math.round(byDay[day] * 10000) / 10000 };
    });

    // Daily cap check ($5 default, override with ?cap=N)
    var dailyCap = parseFloat((req.query && req.query.cap) || '5');
    var capStatus = totals.today >= dailyCap ? 'OVER_CAP' : totals.today >= dailyCap * 0.8 ? 'NEAR_CAP' : 'OK';

    return res.status(200).json({
      summary: {
        today_usd:    Math.round(totals.today    * 10000) / 10000,
        week_usd:     Math.round(totals.week     * 10000) / 10000,
        month_usd:    Math.round(totals.month    * 10000) / 10000,
        all_time_usd: Math.round(totals.all_time * 10000) / 10000,
        total_api_calls: callCount,
        web_searches_logged: webSearchCount,
        daily_cap_usd: dailyCap,
        cap_status: capStatus
      },
      by_agent: agentList,
      by_model: Object.keys(byModel).map(function(m) {
        return { model: m, calls: byModel[m].calls, cost_usd: Math.round(byModel[m].cost * 10000) / 10000 };
      }).sort(function(a,b){ return b.cost_usd - a.cost_usd; }),
      daily_spend: dayList,
      as_of_cst: cstNow.toISOString().slice(0, 19).replace('T', ' ') + ' CST'
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}