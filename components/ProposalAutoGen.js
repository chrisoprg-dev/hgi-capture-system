import React, { useState, useCallback, useMemo } from 'react';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://api.anthropic.com';

const ProposalAutoGen = ({ onProposalGenerated, initialSections = [] }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedSections, setSelectedSections] = useState([]);
  const [generatedContent, setGeneratedContent] = useState('');
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState('');

  const defaultSections = [
    { id: 'executive_summary', name: 'Executive Summary', description: 'High-level overview and key value propositions' },
    { id: 'problem_statement', name: 'Problem Statement', description: 'Clearly define the problem being addressed' },
    { id: 'proposed_solution', name: 'Proposed Solution', description: 'Detailed solution approach and methodology' },
    { id: 'technical_approach', name: 'Technical Approach', description: 'Technical implementation details and architecture' },
    { id: 'timeline_milestones', name: 'Timeline & Milestones', description: 'Project schedule and key deliverables' },
    { id: 'budget_resources', name: 'Budget & Resources', description: 'Cost breakdown and resource requirements' },
    { id: 'team_qualifications', name: 'Team Qualifications', description: 'Team expertise and relevant experience' },
    { id: 'risk_mitigation', name: 'Risk Assessment', description: 'Potential risks and mitigation strategies' },
    { id: 'success_metrics', name: 'Success Metrics', description: 'Key performance indicators and success criteria' },
    { id: 'appendices', name: 'Appendices', description: 'Supporting documents and additional information' }
  ];

  const availableSections = useMemo(() => {
    return initialSections.length > 0 ? initialSections : defaultSections;
  }, [initialSections]);

  const knowledgeBase = {
    company_profile: {
      name: "TechSolutions Inc.",
      expertise: "Software development, AI/ML, cloud infrastructure, data analytics",
      experience: "15+ years in enterprise solutions",
      team_size: "50+ engineers and consultants",
      certifications: "ISO 9001, SOC 2, AWS Partner"
    },
    technical_capabilities: [
      "Full-stack web development (React, Node.js, Python)",
      "Cloud architecture (AWS, Azure, GCP)",
      "Machine learning and AI implementation",
      "Database design and optimization",
      "DevOps and CI/CD pipelines",
      "Cybersecurity and compliance"
    ],
    past_projects: [
      "Enterprise CRM system for Fortune 500 company",
      "AI-powered analytics platform for healthcare",
      "Cloud migration for financial services",
      "Real-time monitoring system for manufacturing"
    ],
    methodologies: [
      "Agile/Scrum development",
      "Design thinking approach",
      "Test-driven development",
      "Continuous integration/deployment"
    ]
  };

  const handleSectionToggle = useCallback((sectionId) => {
    setSelectedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  const generateSectionContent = async (section, context) => {
    const apiKey = window.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not found. Please set window.ANTHROPIC_API_KEY or REACT_APP_ANTHROPIC_API_KEY');
    }

    const prompt = `Generate professional proposal content for the "${section.name}" section. 

Context: ${context}

Section Description: ${section.description}

Knowledge Base:
- Company: ${knowledgeBase.company_profile.name}
- Expertise: ${knowledgeBase.company_profile.expertise}
- Experience: ${knowledgeBase.company_profile.experience}
- Team: ${knowledgeBase.company_profile.team_size}
- Certifications: ${knowledgeBase.company_profile.certifications}

Technical Capabilities:
${knowledgeBase.technical_capabilities.map(cap => `- ${cap}`).join('\n')}

Past Projects:
${knowledgeBase.past_projects.map(proj => `- ${proj}`).join('\n')}

Methodologies:
${knowledgeBase.methodologies.map(method => `- ${method}`).join('\n')}

Requirements:
1. Write in professional business language
2. Include specific details and metrics where appropriate
3. Align content with our company capabilities
4. Make it compelling and client-focused
5. Use proper formatting with headers and bullet points
6. Length should be 200-500 words depending on section complexity

Generate only the section content, no additional commentary.`;

    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.content[0].text;
  };

  const handleGenerate = async () => {
    if (selectedSections.length === 0) {
      setError('Please select at least one section to generate');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setGeneratedContent('');

    try {
      const context = "Generate a comprehensive business proposal that demonstrates our technical expertise and ability to deliver high-quality solutions.";
      let fullProposal = '';
      const totalSections = selectedSections.length;

      for (let i = 0; i < selectedSections.length; i++) {
        const sectionId = selectedSections[i];
        const section = availableSections.find(s => s.id === sectionId);
        
        setCurrentSection(section.name);
        setProgress(((i + 1) / totalSections) * 100);

        try {
          const content = await generateSectionContent(section, context);
          fullProposal += `\n\n## ${section.name}\n\n${content}`;
        } catch (sectionError) {
          console.error(`Error generating ${section.name}:`, sectionError);
          fullProposal += `\n\n## ${section.name}\n\n[Error generating content for this section: ${sectionError.message}]`;
        }

        // Add small delay to prevent rate limiting
        if (i < selectedSections.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setGeneratedContent(fullProposal.trim());
      setCurrentSection('');
      
      if (onProposalGenerated) {
        onProposalGenerated(fullProposal.trim());
      }

    } catch (err) {
      setError(`Generation failed: ${err.message}`);
      console.error('Proposal generation error:', err);
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setCurrentSection('');
    }
  };

  const handleSelectAll = () => {
    if (selectedSections.length === availableSections.length) {
      setSelectedSections([]);
    } else {
      setSelectedSections(availableSections.map(section => section.id));
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      alert('Content copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const downloadProposal = () => {
    const blob = new Blob([generatedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proposal-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="proposal-auto-gen" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>Automated Proposal Generator</h2>
        <p style={{ color: '#7f8c8d', fontSize: '14px' }}>
          Select sections to generate and create a comprehensive business proposal using AI
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Section Selection */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: '#34495e', margin: 0 }}>Select Sections</h3>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '5px 10px',
                background: '#ecf0f1',
                border: '1px solid #bdc3c7',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {selectedSections.length === availableSections.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
            {availableSections.map(section => (
              <div
                key={section.id}
                style={{
                  padding: '12px',
                  margin: '5px 0',
                  border: '1px solid #e0e0e0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: selectedSections.includes(section.id) ? '#e8f5e8' : '#fff',
                  transition: 'background-color 0.2s'
                }}
                onClick={() => handleSectionToggle(section.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(section.id)}
                    onChange={() => {}}
                    style={{ marginRight: '10px' }}
                  />
                  <strong style={{ color: '#2c3e50', fontSize: '14px' }}>{section.name}</strong>
                </div>
                <div style={{ color: '#7f8c8d', fontSize: '12px', paddingLeft: '25px' }}>
                  {section.description}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || selectedSections.length === 0}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: isGenerating ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s'
              }}
            >
              {isGenerating ? `Generating... (${Math.round(progress)}%)` : 'Generate Proposal'}
            </button>

            {isGenerating && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ 
                  width: '100%', 
                  height: '8px', 
                  backgroundColor: '#ecf0f1', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#3498db',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                {currentSection && (
                  <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '5px' }}>
                    Currently generating: {currentSection}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#fadbd8',
                border: '1px solid #e74c3c',
                borderRadius: '4px',
                color: '#c0392b',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Generated Content */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: '#34495e', margin: 0 }}>Generated Content</h3>
            {generatedContent && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '5px 10px',
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Copy
                </button>
                <button
                  onClick={downloadProposal}
                  style={{
                    padding: '5px 10px',
                    background: '#9b59b6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Download
                </button>
              </div>
            )}
          </div>

          <div style={{
            height: '500px',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '15px',
            backgroundColor: '#fafafa',
            overflowY: 'auto',
            fontSize: '14px',
            lineHeight: '1.6'
          }}>
            {generatedContent ? (
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordWrap: 'break-word', 
                margin: 0,
                fontFamily: 'inherit'
              }}>
                {generatedContent}
              </pre>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#bdc3c7',
                fontSize: '16px'
              }}>
                Generated proposal content will appear here
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Knowledge Base Preview */}
      <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
        <h4 style={{ color: '#34495e', marginBottom: '15px' }}>Knowledge Base Preview</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          <div>
            <h5 style={{ color: '#2c3e50', marginBottom: '8px' }}>Company Profile</h5>
            <ul style={{ fontSize: '12px', color: '#7f8c8d', margin: 0, paddingLeft: '20px' }}>
              <li>Name: {knowledgeBase.company_profile.name}</li>
              <li>Experience: {knowledgeBase.company_profile.experience}</li>
              <li>Team: {knowledgeBase.company_profile.team_size}</li>
            </ul>
          </div>
          <div>
            <h5 style={{ color: '#2c3e50', marginBottom: '8px' }}>Technical Capabilities</h5>
            <ul style={{ fontSize: '12px', color: '#7f8c8d', margin: 0, paddingLeft: '20px' }}>
              {knowledgeBase.technical_capabilities.slice(0, 3).map((cap, index) => (
                <li key={index}>{cap}</li>
              ))}
              <li>+ {knowledgeBase.technical_capabilities.length - 3} more...</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalAutoGen;