```javascript
import React, { useState, useEffect } from 'react';
import { BG, BG2, BG3, GOLD, TEXT, TEXT_D, BORDER, Card, Badge, Btn, AIOut, OPIBadge } from './shared';
import { callClaude } from '../utils/apiUtils';

const OpportunityBrief = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [researchResults, setResearchResults] = useState('');
  const [scoringResults, setScoringResults] = useState('');

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      const response = await fetch('/api/opportunities');
      const data = await response.json();
      const opps = data.opportunities || data || [];
      const sortedOpps = opps.sort((a, b) => (b.opi_score || 0) - (a.opi_score || 0));
      setOpportunities(sortedOpps);
      if (sortedOpps.length > 0) {
        setSelectedOpp(sortedOpps[0]);
      }
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysLeft = (dueDate) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDaysLeft = (days) => {
    if (days === null) return '';
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  const runFullResearch = async () => {
    if (!selectedOpp) return;
    
    setResearching(true);
    const prompt = `Please conduct comprehensive research on this federal opportunity:

Title: ${selectedOpp.title}
Agency: ${selectedOpp.agency}
Description: ${selectedOpp.description}
Scope: ${selectedOpp.scope_of_work?.join(', ')}

Research focus areas:
1. Agency background and procurement history
2. Key stakeholders and decision makers
3. Technical requirements analysis
4. Competitive landscape
5. Past similar awards and outcomes
6. Recommended capture strategy
7. Partnership opportunities
8. Risk assessment

Provide detailed insights for each area to inform our bid/no-bid decision.`;

    try {
      const result = await callClaude(prompt);
      setResearchResults(result);
    } catch (error) {
      console.error('Research error:', error);
      setResearchResults('Error conducting research. Please try again.');
    } finally {
      setResearching(false);
    }
  };

  const scoreWinnability = async () => {
    if (!selectedOpp) return;
    
    setScoring(true);
    const prompt = `Analyze the winnability of this federal opportunity for HGI:

Title: ${selectedOpp.title}
Agency: ${selectedOpp.agency}
Description: ${selectedOpp.description}
HGI Fit: ${selectedOpp.hgi_fit}
Why HGI Wins: ${selectedOpp.why_hgi_wins?.join(', ')}
Key Requirements: ${selectedOpp.key_requirements?.join(', ')}
Incumbent: ${selectedOpp.incumbent || 'Unknown'}
Recompete: ${selectedOpp.recompete ? 'Yes' : 'No'}

Provide:
1. Probability of Win (Pwin) percentage with justification
2. Clear GO/NO-BID recommendation
3. Key factors influencing the decision
4. Specific actions needed to maximize win probability if pursuing`;

    try {
      const result = await callClaude(prompt);
      setScoringResults(result);
    } catch (error) {
      console.error('Scoring error:', error);
      setScoringResults('Error scoring winnability. Please try again.');
    } finally {
      setScoring(false);
    }
  };

  const startProposal = () => {
    alert('Proposal engine integration coming soon!');
  };

  if (loading) {
    return (
      <div className={`${BG} min-h-screen p-6`}>
        <div className={`${TEXT} text-center text-lg`}>Loading opportunities...</div>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className={`${BG} min-h-screen p-6`}>
        <div className={`${TEXT} text-center text-lg`}>No opportunities found.</div>
      </div>
    );
  }

  return (
    <div className={`${BG} min-h-screen p-6`}>
      <div className="max-w-7xl mx-auto">
        
        {/* Opportunity Selector */}
        <div className="mb-8">
          <h1 className={`${TEXT} text-2xl font-bold mb-4`}>Opportunity Command Center</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                onClick={() => setSelectedOpp(opp)}
                className={`${selectedOpp?.id === opp.id ? BG3 : BG2} ${BORDER} p-4 rounded-lg cursor-pointer hover:${BG3} transition-colors`}
              >
                <div className={`${TEXT} font-medium text-sm mb-2 truncate`}>{opp.title}</div>
                <div className={`${TEXT_D} text-xs mb-2`}>{opp.agency}</div>
                <div className="flex items-center justify-between">
                  <OPIBadge score={opp.opi_score} />
                  <Badge text={opp.urgency || 'Normal'} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedOpp && (
          <div className="space-y-6">
            
            {/* Header Section */}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div className="flex-1 min-w-0">
                  <h1 className={`${GOLD} text-3xl font-bold mb-2`}>{selectedOpp.title}</h1>
                  <div className={`${TEXT} text-xl mb-3`}>{selectedOpp.agency}</div>
                  <div className="flex flex-wrap items-center gap-4">
                    <OPIBadge score={selectedOpp.opi_score} size="large" />
                    <Badge text={selectedOpp.urgency || 'Normal'} />
                    <Badge text={selectedOpp.vertical || 'General'} />
                    {selectedOpp.due_date && (
                      <Badge 
                        text={formatDaysLeft(calculateDaysLeft(selectedOpp.due_date))}
                        color={calculateDaysLeft(selectedOpp.due_date) < 7 ? 'red' : 'blue'}
                      />
                    )}
                  </div>
                </div>
                {selectedOpp.source_url && (
                  <Btn 
                    onClick={() => window.open(selectedOpp.source_url, '_blank')}
                    variant="outline"
                  >
                    View Source
                  </Btn>
                )}
              </div>
            </Card>

            {/* Executive Summary */}
            <Card>
              <h2 className={`${TEXT} text-xl font-semibold mb-4`}>Executive Summary</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className={`${TEXT} font-medium mb-2`}>Description</h3>
                  <div className={`${TEXT_D} leading-relaxed`}>{selectedOpp.description}</div>
                </div>
                
                {selectedOpp.hgi_fit && (
                  <div>
                    <h3 className={`${TEXT} font-medium mb-2`}>HGI Fit Analysis</h3>
                    <div className={`${TEXT_D} leading-relaxed whitespace-pre-wrap`}>{selectedOpp.hgi_fit}</div>
                  </div>
                )}
              </div>
            </Card>

            {/* Go/No-Go Decision Box */}
            <Card>
              <h2 className={`${TEXT} text-xl font-semibold mb-4`}>Go/No-Go Analysis</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className={`text-green-400 font-medium mb-3`}>Why HGI Wins</h3>
                  <ul className="space-y-2">
                    {(selectedOpp.why_hgi_wins || []).map((item, idx) => (
                      <li key={idx} className={`${TEXT_D} flex items-start`}>
                        <span className="text-green-400 mr-2">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div>
                  <h3 className={`text-orange-400 font-medium mb-3`}>Key Requirements</h3>
                  <ul className="space-y-2">
                    {(selectedOpp.key_requirements || []).map((item, idx) => (
                      <li key={idx} className={`${TEXT_D} flex items-start`}>
                        <span className="text-orange-400 mr-2">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {selectedOpp.capture_action && (
                <div className={`${BG3} p-4 rounded-lg mt-4`}>
                  <h3 className={`${TEXT} font-medium mb-2`}>Capture Strategy</h3>
                  <div className={`${TEXT_D}`}>{selectedOpp.capture_action}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 mt-4">
                {selectedOpp.incumbent && (
                  <div>
                    <span className={`${TEXT_D} text-sm`}>Incumbent: </span>
                    <span className={`${TEXT}`}>{selectedOpp.incumbent}</span>
                  </div>
                )}
                <div>
                  <span className={`${TEXT_D} text-sm`}>Recompete: </span>
                  <span className={`${TEXT}`}>{selectedOpp.recompete ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </Card>

            {/* Scope of Work */}
            {selectedOpp.scope_of_work && selectedOpp.scope_of_work.length > 0 && (
              <Card>
                <h2 className={`${TEXT} text-xl font-semibold mb-4`}>Scope of Work</h2>
                <ul className="space-y-2">
                  {selectedOpp.scope_of_work.map((item, idx) => (
                    <li key={idx} className={`${TEXT_D} flex items-start`}>
                      <span className={`${GOLD} mr-2`}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Action Buttons */}
            <Card>
              <h2 className={`${TEXT} text-xl font-semibold mb-4`}>Decision Actions</h2>
              <div className="flex flex-wrap gap-4">
                <Btn 
                  onClick={runFullResearch}
                  disabled={researching}
                >
                  {researching ? 'Researching...' : 'Run Full Research'}
                </Btn>
                
                <Btn 
                  onClick={scoreWinnability}
                  disabled={scoring}
                  variant="secondary"
                >
                  {scoring ? 'Scoring...' : 'Score Winnability'}
                </Btn>
                
                <Btn 
                  onClick={startProposal}
                  variant="accent"
                >
                  Start Proposal
                </Btn>
              </div>
            </Card>

            {/* Research Output */}
            {(researchResults || scoringResults) && (
              <div className="space-y-4">
                {researchResults && (
                  <AIOut title="Full Research Analysis" content={researchResults} />
                )}
                {scoringResults && (
                  <AIOut title="Winnability Assessment" content={scoringResults} />
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default OpportunityBrief;
```