export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_TOKEN = process.env.APIFY_API_TOKEN;
  const ACTOR_NAME = 'hgi-central-bidding-scraper';

  try {
    // 1. Fetch the list of actors
    const actorsResponse = await fetch(`https://api.apify.com/v2/acts?token=${API_TOKEN}&my=true`);
    if (!actorsResponse.ok) {
      throw new Error(`Failed to fetch actors: ${actorsResponse.status}`);
    }
    const actorsData = await actorsResponse.json();

    // 2. Find the hgi-central-bidding-scraper actor
    const targetActor = actorsData.data.items.find(actor => actor.name === ACTOR_NAME);
    if (!targetActor) {
      return res.status(404).json({ 
        error: 'Actor not found',
        availableActors: actorsData.data.items.map(actor => actor.name)
      });
    }

    // 3. Get the last run
    const runsResponse = await fetch(`https://api.apify.com/v2/acts/${targetActor.id}/runs?token=${API_TOKEN}&limit=1&desc=true`);
    if (!runsResponse.ok) {
      throw new Error(`Failed to fetch runs: ${runsResponse.status}`);
    }
    const runsData = await runsResponse.json();

    if (!runsData.data.items.length) {
      return res.status(200).json({
        actor: targetActor,
        lastRun: null,
        log: null,
        message: 'No runs found'
      });
    }

    const lastRun = runsData.data.items[0];

    // 4. Get the run log (last 2000 chars)
    const logResponse = await fetch(`https://api.apify.com/v2/actor-runs/${lastRun.id}/log?token=${API_TOKEN}`);
    let logData = null;
    if (logResponse.ok) {
      const logText = await logResponse.text();
      logData = logText.slice(-2000); // Last 2000 characters
    }

    // 5. Return all data as JSON
    return res.status(200).json({
      actor: {
        id: targetActor.id,
        name: targetActor.name,
        username: targetActor.username,
        createdAt: targetActor.createdAt,
        modifiedAt: targetActor.modifiedAt
      },
      lastRun: {
        id: lastRun.id,
        status: lastRun.status,
        statusMessage: lastRun.statusMessage,
        startedAt: lastRun.startedAt,
        finishedAt: lastRun.finishedAt,
        buildId: lastRun.buildId,
        exitCode: lastRun.exitCode,
        defaultKeyValueStoreId: lastRun.defaultKeyValueStoreId,
        defaultDatasetId: lastRun.defaultDatasetId,
        stats: lastRun.stats
      },
      log: logData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking Apify status:', error);
    return res.status(500).json({ 
      error: 'Failed to check Apify status', 
      message: error.message 
    });
  }
}
