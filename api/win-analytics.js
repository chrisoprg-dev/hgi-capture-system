export const config = { maxDuration: 30 };

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': KEY, 'Authorization': 'Bearer '+KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const response = await fetch(`${SB}/rest/v1/opportunities?stage=in.(won,lost,submitted)&select=*`, {
        method: 'GET',
        headers: H
      });

      if (!response.ok) {
        throw new Error('Failed to fetch opportunities');
      }

      const opportunities = await response.json();
      
      const wonOpps = opportunities.filter(opp => opp.stage === 'won');
      const lostOpps = opportunities.filter(opp => opp.stage === 'lost');
      const totalDecided = wonOpps.length + lostOpps.length;
      
      const winRate = totalDecided > 0 ? (wonOpps.length / totalDecided * 100) : 0;
      
      const avgOpiWon = wonOpps.length > 0 
        ? wonOpps.reduce((sum, opp) => sum + (opp.opi_score || 0), 0) / wonOpps.length 
        : 0;
      
      const avgOpiLost = lostOpps.length > 0 
        ? lostOpps.reduce((sum, opp) => sum + (opp.opi_score || 0), 0) / lostOpps.length 
        : 0;

      const verticals = [...new Set(opportunities.map(opp => opp.vertical).filter(Boolean))];
      const byVertical = verticals.map(vertical => {
        const verticalOpps = opportunities.filter(opp => opp.vertical === vertical);
        const verticalWon = verticalOpps.filter(opp => opp.stage === 'won').length;
        const verticalLost = verticalOpps.filter(opp => opp.stage === 'lost').length;
        const verticalTotal = verticalWon + verticalLost;
        
        return {
          vertical,
          win_rate: verticalTotal > 0 ? (verticalWon / verticalTotal * 100) : 0,
          total_opportunities: verticalTotal
        };
      });

      const opiCalibration = avgOpiWon > avgOpiLost ? 'working' : 'needs_adjustment';
      
      const recommendations = [];
      if (avgOpiWon <= avgOpiLost) {
        recommendations.push('OPI scoring model needs recalibration - lost deals have higher scores than won deals');
      }
      if (winRate < 30) {
        recommendations.push('Overall win rate is low - review qualification criteria and sales process');
      }
      if (avgOpiWon < 70) {
        recommendations.push('Won opportunities have low OPI scores - consider adjusting scoring weights');
      }
      if (recommendations.length === 0) {
        recommendations.push('OPI model is performing well - continue monitoring for consistency');
      }

      res.status(200).json({
        win_rate: Math.round(winRate * 100) / 100,
        avg_opi_won: Math.round(avgOpiWon * 100) / 100,
        avg_opi_lost: Math.round(avgOpiLost * 100) / 100,
        by_vertical: byVertical,
        opi_calibration: opiCalibration,
        recommendations
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } 
  else if (req.method === 'POST') {
    try {
      const { opportunity_id, outcome, actual_value, notes } = req.body;
      
      if (!opportunity_id || !outcome || !['won', 'lost'].includes(outcome)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      const updateData = {
        stage: outcome,
        updated_at: new Date().toISOString()
      };

      if (actual_value) updateData.actual_value = actual_value;
      if (notes) updateData.outcome_notes = notes;

      const response = await fetch(`${SB}/rest/v1/opportunities?id=eq.${opportunity_id}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update opportunity');
      }

      res.status(200).json({ success: true, message: 'Opportunity outcome recorded' });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } 
  else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: 'Method not allowed' });
  }
}