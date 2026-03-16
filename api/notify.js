export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

function formatNotification(data) {
  const type = data.type || 'info';
  const templates = {
    'tier1_alert': {
      subject: 'HGI ALERT: Tier 1 Opportunity — ' + (data.title || ''),
      body: 'New Tier 1 opportunity detected.\n\nTitle: ' + (data.title || '') + '\nAgency: ' + (data.agency || '') + '\nOPI Score: ' + (data.opi_score || 'N/A') + '\nVertical: ' + (data.vertical || '') + '\nUrgency: ' + (data.urgency || '') + '\n\nView in system: https://hgi-capture-system.vercel.app',
      priority: 'high'
    },
    'go_decision': {
      subject: 'HGI GO DECISION: ' + (data.title || ''),
      body: 'Winnability assessment complete.\n\nTitle: ' + (data.title || '') + '\nAgency: ' + (data.agency || '') + '\nRecommendation: ' + (data.recommendation || '') + '\nPwin: ' + (data.pwin || 0) + '%\n\nView in system: https://hgi-capture-system.vercel.app',
      priority: 'high'
    },
    'stage_change': {
      subject: 'HGI Pipeline: ' + (data.title || '') + ' moved to ' + (data.stage || ''),
      body: 'Opportunity stage changed.\n\nTitle: ' + (data.title || '') + '\nAgency: ' + (data.agency || '') + '\nNew Stage: ' + (data.stage || '') + '\n\nView in system: https://hgi-capture-system.vercel.app',
      priority: 'medium'
    },
    'batch_summary': {
      subject: 'HGI Scraper: ' + (data.tier1_count || 0) + ' new Tier 1 opportunities found',
      body: 'Scraper batch complete.\n\nNew opportunities: ' + (data.new_count || 0) + '\nTier 1 (OPI 70+): ' + (data.tier1_count || 0) + '\n\nView in system: https://hgi-capture-system.vercel.app',
      priority: data.tier1_count > 0 ? 'high' : 'low'
    },
    'deadline_warning': {
      subject: 'HGI DEADLINE: ' + (data.title || '') + ' — ' + (data.days_left || 0) + ' days remaining',
      body: 'Upcoming deadline alert.\n\nTitle: ' + (data.title || '') + '\nAgency: ' + (data.agency || '') + '\nDeadline: ' + (data.deadline || '') + '\nDays Left: ' + (data.days_left || 0) + '\n\nView in system: https://hgi-capture-system.vercel.app',
      priority: 'high'
    }
  };
  return templates[type] || { subject: 'HGI Notification: ' + (data.title || ''), body: JSON.stringify(data, null, 2), priority: 'medium' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const data = req.body || {};
    const notification = formatNotification(data);
    
    try {
      // Store notification in hunt_runs with a special source prefix
      await fetch(SB + '/rest/v1/hunt_runs', {
        method: 'POST',
        headers: { ...H, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          source: 'notify:' + (data.type || 'info'),
          status: notification.priority + '|' + (data.opportunity_id || 'system') + '|unread',
          run_at: new Date().toISOString(),
          opportunities_found: 0
        })
      });

      return res.status(200).json({ 
        success: true, 
        notification: { subject: notification.subject, priority: notification.priority },
        note: 'Stored in system. Gmail delivery coming in next build phase.'
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'GET') {
    // Return unread notifications
    const { limit = 20 } = req.query;
    try {
      const r = await fetch(SB + '/rest/v1/hunt_runs?source=like.notify:*&status=like.*unread*&order=run_at.desc&limit=' + limit, { headers: H });
      const data = await r.json();
      return res.status(200).json({
        notifications: (data || []).map(n => ({
          id: n.id,
          type: (n.source || '').replace('notify:', ''),
          priority: (n.status || '').split('|')[0],
          opportunity_id: (n.status || '').split('|')[1],
          read: (n.status || '').includes('read') && !(n.status || '').includes('unread'),
          timestamp: n.run_at
        })),
        unread_count: (data || []).length
      });
    } catch(e) {
      return res.status(200).json({ notifications: [], unread_count: 0 });
    }
  }

  if (req.method === 'PATCH') {
    // Mark notification as read
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    try {
      // Get current status
      const r = await fetch(SB + '/rest/v1/hunt_runs?id=eq.' + encodeURIComponent(id), { headers: H });
      const records = await r.json();
      if (records && records.length > 0) {
        const newStatus = (records[0].status || '').replace('unread', 'read');
        await fetch(SB + '/rest/v1/hunt_runs?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH', headers: H, body: JSON.stringify({ status: newStatus })
        });
      }
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}