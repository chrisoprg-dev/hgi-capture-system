function ContentEngine() {
  const [activeTab, setActiveTab] = useState('thought-leadership');
  const [formData, setFormData] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (endpoint, action, additionalData = {}) => {
    setLoading(true);
    try {
      const payload = { action, ...formData, ...additionalData };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Error:', error);
    }
    setLoading(false);
  };

  const renderThoughtLeadership = () => (
    <div className="space-y-4">
      <input
        placeholder="Topic"
        value={formData.topic || ''}
        onChange={(e) => handleInputChange('topic', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Audience"
        value={formData.audience || ''}
        onChange={(e) => handleInputChange('audience', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <select
        value={formData.format || 'Article'}
        onChange={(e) => handleInputChange('format', e.target.value)}
        className="w-full p-3 border rounded-lg"
      >
        <option value="Article">Article</option>
        <option value="LinkedIn Post">LinkedIn Post</option>
        <option value="Capability Statement">Capability Statement</option>
        <option value="White Paper Outline">White Paper Outline</option>
      </select>
      <button
        onClick={() => {
          const actionMap = {
            'Article': 'article',
            'LinkedIn Post': 'linkedin',
            'Capability Statement': 'capability_statement',
            'White Paper Outline': 'white_paper_outline'
          };
          handleSubmit('/api/thought-leadership', actionMap[formData.format || 'Article']);
        }}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        disabled={loading}
      >
        Generate
      </button>
      {results.result && <AIOut result={results.result} />}
    </div>
  );

  const renderPPQGenerator = () => (
    <div className="space-y-4">
      <input
        placeholder="Agency"
        value={formData.agency || ''}
        onChange={(e) => handleInputChange('agency', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <select
        value={formData.vertical || ''}
        onChange={(e) => handleInputChange('vertical', e.target.value)}
        className="w-full p-3 border rounded-lg"
      >
        <option value="">Select Vertical</option>
        <option value="IT">IT</option>
        <option value="Construction">Construction</option>
        <option value="Professional Services">Professional Services</option>
      </select>
      <textarea
        placeholder="RFP Context"
        value={formData.rfp_context || ''}
        onChange={(e) => handleInputChange('rfp_context', e.target.value)}
        className="w-full p-3 border rounded-lg h-24"
      />
      <input
        placeholder="Evaluation Criteria"
        value={formData.evaluation_criteria || ''}
        onChange={(e) => handleInputChange('evaluation_criteria', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <div className="flex gap-4">
        <button
          onClick={() => handleSubmit('/api/ppq-automation', 'generate_ppq')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          disabled={loading}
        >
          Generate PPQ Responses
        </button>
        <button
          onClick={() => handleSubmit('/api/ppq-automation', 'match_pp')}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          disabled={loading}
        >
          Match Best PP
        </button>
      </div>
      {results.ppq_responses && <AIOut result={results.ppq_responses} />}
      {results.matched_projects && <AIOut result={results.matched_projects} />}
    </div>
  );

  const renderTeamingRadar = () => (
    <div className="space-y-4">
      <input
        placeholder="Opportunity Title"
        value={formData.opportunity_title || ''}
        onChange={(e) => handleInputChange('opportunity_title', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Agency"
        value={formData.agency || ''}
        onChange={(e) => handleInputChange('agency', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Vertical"
        value={formData.vertical || ''}
        onChange={(e) => handleInputChange('vertical', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Set Aside"
        value={formData.set_aside || ''}
        onChange={(e) => handleInputChange('set_aside', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Value"
        value={formData.value || ''}
        onChange={(e) => handleInputChange('value', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <textarea
        placeholder="Scope"
        value={formData.scope || ''}
        onChange={(e) => handleInputChange('scope', e.target.value)}
        className="w-full p-3 border rounded-lg h-24"
      />
      <button
        onClick={() => handleSubmit('/api/teaming-radar', 'analyze')}
        className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        disabled={loading}
      >
        Analyze Teaming
      </button>
      {results.analysis && <AIOut result={results.analysis} />}
    </div>
  );

  const renderDisasterProtocol = () => (
    <div className="space-y-4">
      <input
        placeholder="Disaster Name"
        value={formData.disaster_name || ''}
        onChange={(e) => handleInputChange('disaster_name', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <select
        value={formData.state || ''}
        onChange={(e) => handleInputChange('state', e.target.value)}
        className="w-full p-3 border rounded-lg"
      >
        <option value="">Select State</option>
        <option value="LA">Louisiana</option>
        <option value="TX">Texas</option>
        <option value="FL">Florida</option>
        <option value="MS">Mississippi</option>
        <option value="AL">Alabama</option>
        <option value="GA">Georgia</option>
      </select>
      <select
        value={formData.incident_type || ''}
        onChange={(e) => handleInputChange('incident_type', e.target.value)}
        className="w-full p-3 border rounded-lg"
      >
        <option value="">Select Incident Type</option>
        <option value="Hurricane">Hurricane</option>
        <option value="Flood">Flood</option>
        <option value="Tornado">Tornado</option>
        <option value="Wildfire">Wildfire</option>
        <option value="Other">Other</option>
      </select>
      <input
        type="date"
        placeholder="Declaration Date"
        value={formData.declaration_date || ''}
        onChange={(e) => handleInputChange('declaration_date', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <input
        placeholder="Estimated Damage"
        value={formData.estimated_damage || ''}
        onChange={(e) => handleInputChange('estimated_damage', e.target.value)}
        className="w-full p-3 border rounded-lg"
      />
      <button
        onClick={() => handleSubmit('/api/disaster-response-protocol', null)}
        className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
        disabled={loading}
      >
        Generate Response Package
      </button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.brief && <AIOut title="Brief" result={results.brief} />}
        {results.opportunities && <AIOut title="Opportunities" result={results.opportunities} />}
        {results.outreach_letter && <AIOut title="Outreach Letter" result={results.outreach_letter} />}
        {results.timeline && <AIOut title="90-Day Timeline" result={results.timeline} />}
      </div>
    </div>
  );

  const tabs = [
    { key: 'thought-leadership', label: 'Thought Leadership', component: renderThoughtLeadership },
    { key: 'ppq-generator', label: 'PPQ Generator', component: renderPPQGenerator },
    { key: 'teaming-radar', label: 'Teaming Radar', component: renderTeamingRadar },
    { key: 'disaster-protocol', label: 'Disaster Protocol', component: renderDisasterProtocol }
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {tabs.find(tab => tab.key === activeTab)?.component()}
      </div>
    </div>
  );
}