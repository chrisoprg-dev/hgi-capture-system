const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
  defaultHeaders: {
    'anthropic-version': '2023-06-01',
  },
});

async function analyzeLossWithClaude(lossData) {
  const prompt = `Analyze this procurement loss for HGI (a government consulting firm):

Opportunity: ${lossData.opportunity_title}
Agency: ${lossData.agency}
Award Date: ${lossData.award_date}
Our Bid: $${lossData.our_bid_amount?.toLocaleString() || 'N/A'}
Winner: ${lossData.winner_name}
Winning Amount: $${lossData.winner_amount?.toLocaleString() || 'N/A'}
Vertical: ${lossData.vertical}
Notes: ${lossData.notes || 'None'}

Please provide analysis on:
1. Why we likely lost this opportunity
2. Price gap analysis (if amounts available)
3. Key learnings for future bids
4. Specific recommendations to win similar opportunities

Be concise but actionable. Focus on competitive intelligence and pricing strategy.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'claude-3-haiku-20240307',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Claude analysis error:', error);
    return 'Analysis unavailable - API error';
  }
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const {
        opportunity_title,
        agency,
        award_date,
        our_bid_amount,
        winner_name,
        winner_amount,
        vertical,
        notes
      } = req.body;

      if (!opportunity_title || !agency) {
        return res.status(400).json({ error: 'opportunity_title and agency are required' });
      }

      const lossData = {
        opportunity_title,
        agency,
        award_date,
        our_bid_amount: our_bid_amount ? parseFloat(our_bid_amount) : null,
        winner_name,
        winner_amount: winner_amount ? parseFloat(winner_amount) : null,
        vertical,
        notes
      };

      // Get Claude analysis
      const analysis = await analyzeLossWithClaude(lossData);

      // Store in Supabase
      const { data, error } = await supabase
        .from('hunt_runs')
        .insert({
          source: 'loss_analysis',
          status: 'loss',
          search_terms: opportunity_title,
          results_summary: JSON.stringify({
            ...lossData,
            analysis,
            created_at: new Date().toISOString()
          })
        })
        .select();

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to store loss record' });
      }

      res.json({
        analysis,
        stored: true,
        record_id: data[0]?.id
      });

    } catch (error) {
      console.error('Loss analysis error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('hunt_runs')
        .select('*')
        .eq('source', 'loss_analysis')
        .eq('status', 'loss')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Failed to retrieve loss records' });
      }

      const lossRecords = data.map(record => {
        let parsedData = {};
        try {
          parsedData = JSON.parse(record.results_summary || '{}');
        } catch (e) {
          console.error('Parse error for record', record.id);
        }

        return {
          id: record.id,
          created_at: record.created_at,
          ...parsedData
        };
      });

      res.json({ records: lossRecords });

    } catch (error) {
      console.error('Get loss records error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }

  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).json({ error: 'Method not allowed' });
  }
};