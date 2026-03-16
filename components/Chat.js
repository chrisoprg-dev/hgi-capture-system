import React, { useState, useEffect, useRef } from 'react';
import { usePipeline } from '../contexts/PipelineContext';
import { callClaude } from '../utils/claude';
import { Btn } from './ui';
import { COLORS } from '../utils/constants';

const { BG, BG2, BG3, TEXT, TEXT_D, GOLD, BORDER } = COLORS;

function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return React.createElement('div', { key: i, style: { marginBottom: 4, paddingLeft: 12 } }, line);
    }
    if (line.startsWith('**') && line.endsWith('**')) {
      return React.createElement('div', { key: i, style: { fontWeight: 600, marginBottom: 8, color: GOLD } }, line.slice(2, -2));
    }
    return React.createElement('div', { key: i, style: { marginBottom: line.trim() ? 8 : 4 } }, line || ' ');
  });
}

function Chat() {
  var pl = usePipeline();
  var msgState = useState([]);
  var messages = msgState[0];
  var setMessages = msgState[1];
  var inputState = useState('');
  var input = inputState[0];
  var setInput = inputState[1];
  var loadState = useState(false);
  var loading = loadState[0];
  var setLoading = loadState[1];
  var messagesEndRef = useRef(null);

  var scrollToBottom = function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(function() { scrollToBottom(); }, [messages]);

  var sendMessage = async function() {
    if (!input.trim() || loading) return;
    var userMsg = input.trim();
    setInput('');
    setMessages(function(prev) { return prev.concat([{ role: 'user', content: userMsg }]); });
    setLoading(true);

    try {
      // Build context from pipeline
      var pipelineContext = '';
      if (pl.pipeline && pl.pipeline.length > 0) {
        pipelineContext = '\\nACTIVE PIPELINE (' + pl.pipeline.length + ' opportunities):\\n';
        pl.pipeline.slice(0, 10).forEach(function(o) {
          pipelineContext += '- ' + o.title + ' | Agency: ' + (o.agency || 'Unknown') + ' | OPI: ' + (o.opi_score || 'N/A') + ' | Due: ' + (o.due_date || 'Unknown') + ' | Stage: ' + (o.stage || 'identified') + '\\n';
        });
      }

      // Get KB context
      var kbContext = '';
      try {
        var kbR = await fetch('/api/knowledge-query?vertical=all');
        if (kbR.ok) {
          var kbD = await kbR.json();
          kbContext = kbD.prompt_injection || '';
        }
      } catch(e) {}

      // Get system status
      var statusContext = '';
      try {
        var stR = await fetch('/api/opportunities?sort=opi_score.desc&limit=5');
        if (stR.ok) {
          var stD = await stR.json();
          var topOpps = stD.opportunities || stD || [];
          if (topOpps.length > 0) {
            statusContext = '\\nTOP OPPORTUNITIES BY OPI:\\n';
            topOpps.forEach(function(o) {
              statusContext += '- ' + o.title + ' (OPI ' + (o.opi_score || 0) + ', ' + (o.agency || '') + ', due ' + (o.due_date || 'TBD') + ')\\n';
            });
          }
        }
      } catch(e) {}

      var systemPrompt = 'You are the HGI AI Capture System assistant. You help HGI staff (Christopher Oney - President, Lou Resweber - CEO, Candy Dottolo - CAO, Dillon - Proposals) understand the pipeline, opportunities, and system capabilities.\\n\\nHGI CONTEXT: Hammerman & Gainer LLC, founded 1929, 97 years, ~50 employees. Largest minority-owned TPA in the US. Headquartered in Kenner, Louisiana. Core verticals: Disaster Recovery (CDBG-DR, FEMA PA), TPA/Claims Administration, Property Tax Appeals, Workforce Services, Health Programs, Infrastructure, Federal Contracts.\\n\\nPast Performance: Road Home Program ' + String.fromCharCode(36) + '12B, BP GCCF 1M+ claims, PBGC 34M beneficiaries, TPCIGA 28 years, Restore Louisiana, Terrebonne Parish.\\n\\nRATE CARD: Principal ' + String.fromCharCode(36) + '180/hr, Program Director ' + String.fromCharCode(36) + '165/hr, SME ' + String.fromCharCode(36) + '155/hr, Sr PM ' + String.fromCharCode(36) + '150/hr, PM ' + String.fromCharCode(36) + '140/hr, Grant Writer ' + String.fromCharCode(36) + '105/hr, Admin Support ' + String.fromCharCode(36) + '65/hr.' + pipelineContext + statusContext + (kbContext ? '\\nKNOWLEDGE BASE:\\n' + kbContext.slice(0, 2000) : '') + '\\n\\nAnswer questions clearly and concisely. Reference specific opportunities by name and OPI score when relevant. If asked about something not in your context, say so honestly.';

      var response = await callClaude(userMsg, systemPrompt, 2000);
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: response }]); });
    } catch(e) {
      setMessages(function(prev) { return prev.concat([{ role: 'assistant', content: 'Error: ' + e.message }]); });
    }
    setLoading(false);
  };

  var handleKeyDown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  var quickActions = [
    { label: 'Pipeline summary', msg: 'Give me a quick summary of our current pipeline — how many opportunities, top 3 by OPI, any urgent deadlines.' },
    { label: 'What should I focus on today?', msg: 'Based on the current pipeline, what should HGI focus on today? Consider deadlines, OPI scores, and stage.' },
    { label: 'Competitive landscape', msg: 'Who are our main competitors for the top opportunities in the pipeline? What are their strengths vs HGI?' },
    { label: 'System status', msg: 'What is the current system status? How many opportunities are being tracked, when was the last scraper run, any issues?' }
  ];

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' } },
    // Header
    React.createElement('div', { style: { marginBottom: 16 } },
      React.createElement('h2', { style: { color: GOLD, margin: 0, fontSize: 20, fontWeight: 800 } }, 'System Chat'),
      React.createElement('p', { style: { color: TEXT_D, margin: '4px 0 0', fontSize: 12 } }, 'Ask questions about the pipeline, opportunities, or HGI capabilities')
    ),

    // Quick actions (only show when no messages)
    messages.length === 0 ? React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 } },
      quickActions.map(function(qa) {
        return React.createElement('button', {
          key: qa.label,
          onClick: function() { setInput(qa.msg); },
          style: { padding: '10px 14px', background: BG2, border: '1px solid ' + BORDER, borderRadius: 6, color: TEXT_D, fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.4 }
        },
          React.createElement('div', { style: { color: GOLD, fontWeight: 600, fontSize: 11, marginBottom: 4 } }, qa.label),
          React.createElement('div', { style: { fontSize: 11, color: TEXT_D } }, qa.msg.slice(0, 60) + '...')
        );
      })
    ) : null,

    // Messages area
    React.createElement('div', { style: { flex: 1, overflowY: 'auto', marginBottom: 16, padding: '0 4px' } },
      messages.map(function(m, i) {
        var isUser = m.role === 'user';
        return React.createElement('div', {
          key: i,
          style: { display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }
        },
          React.createElement('div', {
            style: {
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: isUser ? GOLD + '22' : BG2,
              border: '1px solid ' + (isUser ? GOLD + '44' : BORDER),
              color: TEXT,
              fontSize: 13,
              lineHeight: 1.6
            }
          },
            isUser ? m.content : React.createElement('div', null, renderMarkdown(m.content))
          )
        );
      }),
      loading ? React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-start', marginBottom: 12 } },
        React.createElement('div', { style: { padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: BG2, border: '1px solid ' + BORDER, color: GOLD, fontSize: 13, animation: 'pulse 1.2s infinite' } }, 'Thinking...')
      ) : null,
      React.createElement('div', { ref: messagesEndRef })
    ),

    // Input area
    React.createElement('div', { style: { display: 'flex', gap: 8, padding: '12px 0', borderTop: '1px solid ' + BORDER } },
      React.createElement('textarea', {
        value: input,
        onChange: function(e) { setInput(e.target.value); },
        onKeyDown: handleKeyDown,
        placeholder: 'Ask about the pipeline, opportunities, or HGI capabilities...',
        rows: 2,
        style: { flex: 1, background: BG3, border: '1px solid ' + BORDER, borderRadius: 8, color: TEXT, fontFamily: 'inherit', fontSize: 13, padding: '10px 14px', resize: 'none', outline: 'none', lineHeight: 1.5 }
      }),
      React.createElement(Btn, {
        onClick: sendMessage,
        disabled: loading || !input.trim(),
        style: { alignSelf: 'flex-end' }
      }, loading ? '...' : 'Send')
    )
  );
}

export default Chat;