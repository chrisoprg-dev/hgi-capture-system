import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Query opportunities
    const { data: opportunities, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('status', 'active')
      .order('opi_score', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Calculate pipeline health
    const pipelineHealth = {
      totalActive: opportunities.length,
      tier1Count: opportunities.filter(opp => opp.tier === 1).length,
      pursuingCount: opportunities.filter(opp => opp.phase === 'pursuing').length,
      proposalCount: opportunities.filter(opp => opp.phase === 'proposal').length
    };

    // Get top 5 opportunities
    const top5Opportunities = opportunities.slice(0, 5).map(opp => ({
      title: opp.title,
      agency: opp.agency,
      opi_score: opp.opi_score,
      urgency: opp.urgency,
      due_date: opp.due_date,
      vertical: opp.vertical,
      capture_action: opp.capture_action
    }));

    // Get upcoming deadlines (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingDeadlines = opportunities.filter(opp => {
      if (!opp.due_date) return false;
      const dueDate = new Date(opp.due_date);
      return dueDate <= thirtyDaysFromNow && dueDate >= new Date();
    }).map(opp => ({
      title: opp.title,
      agency: opp.agency,
      due_date: opp.due_date,
      urgency: opp.urgency
    }));

    // Get last hunt run timestamp
    const { data: huntData } = await supabase
      .from('hunt_runs')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const weeklyDigestSummary = {
      lastHuntRun: huntData?.[0]?.created_at || null
    };

    const briefData = {
      top5Opportunities,
      pipelineHealth,
      upcomingDeadlines,
      weeklyDigestSummary,
      generatedAt: new Date().toISOString()
    };

    // Check if HTML format requested
    if (req.query.format === 'html') {
      const html = generateHTMLBrief(briefData);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // Return JSON by default
    res.status(200).json(briefData);
  } catch (error) {
    console.error('Error generating executive brief:', error);
    res.status(500).json({ error: 'Failed to generate executive brief' });
  }
}

function generateHTMLBrief(data) {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getUrgencyColor = (urgency) => {
    switch (urgency?.toLowerCase()) {
      case 'high': return '#ff4444';
      case 'medium': return '#ffaa00';
      case 'low': return '#44ff44';
      default: return '#888';
    }
  };

  const generatedDate = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Executive Intelligence Brief - HGI</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #ffffff;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            text-align: center;
            padding: 40px 0;
            border-bottom: 2px solid #d4af37;
            margin-bottom: 40px;
        }
        .logo-area {
            font-size: 2.5rem;
            font-weight: bold;
            color: #d4af37;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .subtitle {
            font-size: 1.8rem;
            margin-bottom: 20px;
            color: #ffffff;
        }
        .generated-time {
            color: #cccccc;
            font-size: 0.9rem;
        }
        .section {
            margin-bottom: 40px;
        }
        .section-title {
            font-size: 1.5rem;
            color: #d4af37;
            margin-bottom: 20px;
            border-left: 4px solid #d4af37;
            padding-left: 15px;
        }
        .health-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-box {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid #d4af37;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #d4af37;
            display: block;
        }
        .stat-label {
            font-size: 0.9rem;
            color: #cccccc;
            margin-top: 5px;
        }
        .opportunities-grid {
            display: grid;
            gap: 20px;
            margin-bottom: 30px;
        }
        .opportunity-card {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid #444;
            border-radius: 10px;
            padding: 20px;
            position: relative;
            backdrop-filter: blur(5px);
        }
        .opportunity-card:hover {
            border-color: #d4af37;
            transform: translateY(-2px);
            transition: all 0.3s ease;
        }
        .opi-score {
            position: absolute;
            top: 15px;
            right: 15px;
            background: #d4af37;
            color: #1a1a2e;
            font-weight: bold;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
        }
        .opportunity-title {
            font-size: 1.2rem;
            font-weight: bold;
            margin-bottom: 10px;
            padding-right: 80px;
            line-height: 1.3;
        }
        .opportunity-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 15px;
        }
        .detail-item {
            font-size: 0.9rem;
        }
        .detail-label {
            color: #cccccc;
            font-weight: 500;
        }
        .detail-value {
            color: #ffffff;
            margin-top: 2px;
        }
        .urgency-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .deadlines-list {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 20px;
        }
        .deadline-item {
            padding: 15px 0;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .deadline-item:last-child {
            border-bottom: none;
        }
        .deadline-info {
            flex-grow: 1;
        }
        .deadline-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .deadline-agency {
            color: #cccccc;
            font-size: 0.9rem;
        }
        .deadline-date {
            color: #d4af37;
            font-weight: bold;
            font-size: 0.9rem;
        }
        .footer {
            text-align: center;
            padding: 40px 0 20px;
            border-top: 1px solid #333;
            color: #888;
            font-size: 0.9rem;
        }
        .no-data {
            text-align: center;
            color: #888;
            padding: 40px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-area">HGI</div>
            <div class="subtitle">Executive Intelligence Brief</div>
            <div class="generated-time">Generated: ${generatedDate}</div>
        </div>

        <div class="section">
            <h2 class="section-title">Pipeline Health</h2>
            <div class="health-stats">
                <div class="stat-box">
                    <span class="stat-number">${data.pipelineHealth.totalActive}</span>
                    <div class="stat-label">Active Opportunities</div>
                </div>
                <div class="stat-box">
                    <span class="stat-number">${data.pipelineHealth.tier1Count}</span>
                    <div class="stat-label">Tier 1 Prospects</div>
                </div>
                <div class="stat-box">
                    <span class="stat-number">${data.pipelineHealth.pursuingCount}</span>
                    <div class="stat-label">Pursuing Phase</div>
                </div>
                <div class="stat-box">
                    <span class="stat-number">${data.pipelineHealth.proposalCount}</span>
                    <div class="stat-label">Proposal Phase</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Top 5 Active Opportunities</h2>
            <div class="opportunities-grid">
                ${data.top5Opportunities.length ? data.top5Opportunities.map(opp => `
                    <div class="opportunity-card">
                        <div class="opi-score">${opp.opi_score || 'N/A'}</div>
                        <div class="opportunity-title">${opp.title || 'Untitled'}</div>
                        <div class="opportunity-details">
                            <div class="detail-item">
                                <div class="detail-label">Agency</div>
                                <div class="detail-value">${opp.agency || 'N/A'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Vertical</div>
                                <div class="detail-value">${opp.vertical || 'N/A'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Urgency</div>
                                <div class="detail-value">
                                    <span class="urgency-badge" style="background-color: ${getUrgencyColor(opp.urgency)}; color: white;">
                                        ${opp.urgency || 'N/A'}
                                    </span>
                                </div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Due Date</div>
                                <div class="detail-value">${formatDate(opp.due_date)}</div>
                            </div>
                            <div class="detail-item" style="grid-column: 1 / -1;">
                                <div class="detail-label">Capture Action</div>
                                <div class="detail-value">${opp.capture_action || 'No action defined'}</div>
                            </div>
                        </div>
                    </div>
                `).join('') : '<div class="no-data">No active opportunities found</div>'}
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Upcoming Deadlines (Next 30 Days)</h2>
            <div class="deadlines-list">
                ${data.upcomingDeadlines.length ? data.upcomingDeadlines.map(deadline => `
                    <div class="deadline-item">
                        <div class="deadline-info">
                            <div class="deadline-title">${deadline.title || 'Untitled'}</div>
                            <div class="deadline-agency">${deadline.agency || 'Unknown Agency'}</div>
                        </div>
                        <div>
                            <div class="deadline-date">${formatDate(deadline.due_date)}</div>
                            <span class="urgency-badge" style="background-color: ${getUrgencyColor(deadline.urgency)}; color: white; margin-top: 5px; display: inline-block;">
                                ${deadline.urgency || 'N/A'}
                            </span>
                        </div>
                    </div>
                `).join('') : '<div class="no-data">No upcoming deadlines</div>'}
            </div>
        </div>

        <div class="footer">
            For internal use only — Hammerman & Gainer LLC<br>
            Last hunt run: ${data.weeklyDigestSummary.lastHuntRun ? formatDate(data.weeklyDigestSummary.lastHuntRun) : 'Never'}
        </div>
    </div>
</body>
</html>`;
}