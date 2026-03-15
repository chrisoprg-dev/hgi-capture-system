const axios = require('axios');

const USASPENDING_API_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

const getRecompeteStatus = (endDate) => {
  const today = new Date();
  const expirationDate = new Date(endDate);
  const daysUntilExpiration = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
  
  if (daysUntilExpiration <= 90 && daysUntilExpiration >= 0) {
    return { status: 'RECOMPETE_IMMINENT', daysUntilExpiration };
  } else if (daysUntilExpiration <= 180 && daysUntilExpiration > 90) {
    return { status: 'RECOMPETE_SOON', daysUntilExpiration };
  } else if (daysUntilExpiration <= 365 && daysUntilExpiration > 180) {
    return { status: 'RECOMPETE_PIPELINE', daysUntilExpiration };
  }
  
  return { status: 'OUT_OF_RANGE', daysUntilExpiration };
};

const formatDate = (daysOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split('T')[0];
};

const searchPayload = {
  filters: {
    time_period: [
      {
        start_date: formatDate(0),
        end_date: formatDate(365)
      }
    ],
    award_type_codes: ["A", "B", "C", "D"],
    naics_codes: ["541611", "541690", "561110", "561990", "524291", "923120", "921190"],
    place_of_performance_locations: [
      { country: "USA", state: "LA" },
      { country: "USA", state: "TX" },
      { country: "USA", state: "FL" }
    ]
  },
  fields: [
    "Award ID",
    "Recipient Name", 
    "Award Amount",
    "Period of Performance End Date",
    "Awarding Agency",
    "Description"
  ],
  limit: 25,
  sort: "Period of Performance End Date",
  order: "asc"
};

const contractMonitor = async (req, res) => {
  try {
    const response = await axios.post(USASPENDING_API_URL, searchPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (!response.data || !response.data.results) {
      return res.json([]);
    }

    const contracts = response.data.results.map(contract => {
      const recompeteInfo = getRecompeteStatus(contract['Period of Performance End Date']);
      
      return {
        awardId: contract['Award ID'],
        recipientName: contract['Recipient Name'],
        awardAmount: contract['Award Amount'],
        endDate: contract['Period of Performance End Date'],
        awardingAgency: contract['Awarding Agency'],
        description: contract['Description'],
        recompeteStatus: recompeteInfo.status,
        daysUntilExpiration: recompeteInfo.daysUntilExpiration
      };
    }).filter(contract => contract.recompeteStatus !== 'OUT_OF_RANGE');

    res.json(contracts);
    
  } catch (error) {
    console.error('USAspending.gov API error:', error.message);
    res.json([]);
  }
};

module.exports = contractMonitor;