import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('hunt_runs')
        .select('opportunities_found')
        .eq('source', 'apify_batch')
        .order('run_at', { ascending: false })
        .limit(1)

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      const batch = data && data.length > 0 ? data[0].opportunities_found : 0
      return res.status(200).json({ batch })
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { batch, secret } = req.body

      if (secret !== 'hgi-intake-2026-secure') {
        return res.status(401).json({ error: 'Invalid secret' })
      }

      const { error } = await supabase
        .from('hunt_runs')
        .insert({
          source: 'apify_batch',
          opportunities_found: batch,
          status: 'completed',
          run_at: new Date().toISOString()
        })

      if (error) {
        return res.status(500).json({ error: error.message })
      }

      return res.status(200).json({ success: true, batch })
    } catch (error) {
      return res.status(500).json({ error: error.message })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).end(`Method ${req.method} Not Allowed`)
}